const mongoose = require("mongoose");
const { Plan } = require("./models/Plan.js");
const { Subscription } = require("./models/Subscription");
const {
  HttpError,
  computePeriodEnd,
} = require("./utils/subscriptionErrors.js");
const { withIdempotency } = require("./idempotency.service.js");

const ensureValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(String(value)))
    throw new HttpError(400, `Invalid ${fieldName}`);
};

const normalizePlanCode = (rawPlanCode) => {
  const normalized = String(rawPlanCode || "")
    .trim()
    .toLowerCase();
  if (!normalized) throw new HttpError(400, "planCode is required");
  return normalized;
};

const findActivePlanByCode = async (planCode) => {
  const plan = await Plan.findOne({ code: planCode, isActive: true });
  if (!plan) throw new HttpError(404, "Plan not found or inactive");
  return plan;
};

const findActivePlanById = async (planId, session) => {
  const plan = await Plan.findById(planId).session(session);
  if (!plan || !plan.isActive)
    throw new HttpError(400, "Current plan is inactive");
  return plan;
};

const runInTransaction = async (transactionWork) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await transactionWork(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const markSubscriptionActive = (subscription) => {
  subscription.status = "active";
  subscription.cancelAtPeriodEnd = false;
  subscription.canceledAt = null;
  subscription.expiredAt = null;
};

const addSubscriptionHistory = (
  subscription,
  event,
  previousPlanId,
  nextPlanId,
  note,
) => {
  subscription.history.push({
    event,
    fromPlanId: previousPlanId || null,
    toPlanId: nextPlanId || null,
    note,
  });
};

const buildNewSubscription = ({
  sellerId,
  planId,
  periodStart,
  periodEnd,
}) => ({
  sellerId,
  planId,
  status: "active",
  currentPeriodStart: periodStart,
  currentPeriodEnd: periodEnd,
  history: [
    {
      event: "created",
      fromPlanId: null,
      toPlanId: planId,
      note: "Initial subscription",
    },
  ],
});

const subscriptionIsExpired = (subscription, now) =>
  subscription.status === "expired" || subscription.currentPeriodEnd <= now;

const setSubscriptionCycle = (subscription, cycleStart, interval) => {
  subscription.currentPeriodStart = cycleStart;
  subscription.currentPeriodEnd = computePeriodEnd(cycleStart, interval);
};

const renewalAnchorDate = (subscription, now) =>
  subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;

const idempotencyRoutes = {
  changePlan: "POST http://localhost:3001/v1/sellers/subscription/start-or-change",
  renew: "POST http://localhost:3001/v1/sellers/subscription/renew",
};

const buildStartOrChangeHandler = ({ sellerId, normalizedPlanCode }) => {
  return () =>
    runInTransaction(async (session) => {
      const plan = await findActivePlanByCode(normalizedPlanCode);
      const now = new Date();

      const subscription = await Subscription.findOne({ sellerId }).session(
        session,
      );

      if (!subscription) {
        const periodEnd = computePeriodEnd(now, plan.interval);
        const [createdSubscription] = await Subscription.create(
          [
            buildNewSubscription({
              sellerId,
              planId: plan._id,
              periodStart: now,
              periodEnd,
            }),
          ],
          { session },
        );
        return { subscription: createdSubscription };
      }

      const previousPlanId = subscription.planId;
      const expired = subscriptionIsExpired(subscription, now);

      subscription.planId = plan._id;
      markSubscriptionActive(subscription);

      addSubscriptionHistory(
        subscription,
        "changed",
        previousPlanId,
        plan._id,
        expired
          ? "Changed plan after expiration"
          : "Changed plan mid-cycle (no proration)",
      );

      if (expired) setSubscriptionCycle(subscription, now, plan.interval);

      await subscription.save({ session });
      return { subscription };
    });
};

exports.subscriptionService = {
  getBySellerId(sellerId) {
    ensureValidObjectId(sellerId, "sellerId");
    return Subscription.findOne({ sellerId }).populate("planId");
  },

  startOrChangePlan({ sellerId, planCode, actorUserId, idempotencyKey }) {
    ensureValidObjectId(sellerId, "sellerId");
    const normalizedPlanCode = normalizePlanCode(planCode);

    return withIdempotency({
      key: idempotencyKey,
      userId: actorUserId,
      route: idempotencyRoutes.changePlan,
      body: { sellerId, planCode: normalizedPlanCode },
      handler: buildStartOrChangeHandler({ sellerId, normalizedPlanCode }),
    });
  },

  renew({ sellerId, actorUserId, idempotencyKey }) {
    ensureValidObjectId(sellerId, "sellerId");

    return withIdempotency({
      key: idempotencyKey,
      userId: actorUserId,
      route: idempotencyRoutes.renew,
      body: { sellerId },
      handler: async () =>
        runInTransaction(async (session) => {
          const subscription = await Subscription.findOne({ sellerId }).session(
            session,
          );

          if (!subscription) throw new HttpError(404, "Subscription not found");

          const plan = await findActivePlanById(subscription.planId, session);

          const now = new Date();
          const cycleStart = renewalAnchorDate(subscription, now);

          markSubscriptionActive(subscription);
          setSubscriptionCycle(subscription, cycleStart, plan.interval);
          addSubscriptionHistory(
            subscription,
            "renewed",
            null,
            subscription.planId,
            "Manual renew",
          );

          await subscription.save({ session });
          return { subscription };
        }),
    });
  },

  async cancelAtPeriodEnd({ sellerId }) {
    ensureValidObjectId(sellerId, "sellerId");

    const subscription = await Subscription.findOne({ sellerId });

    if (!subscription) throw new HttpError(404, "Subscription not found");

    subscription.cancelAtPeriodEnd = true;
    addSubscriptionHistory(
      subscription,
      "canceled",
      null,
      subscription.planId,
      "Will cancel at period end",
    );

    await subscription.save();
    return { subscription };
  },

  async expireJob() {
    const now = new Date();

    await Subscription.updateMany(
      {
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { $lte: now },
      },
      {
        $set: { status: "expired", expiredAt: now },
        $push: {
          history: { event: "expired", at: now, note: "Auto-expired by job" },
        },
      },
    );

    await Subscription.updateMany(
      {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { $lte: now },
        status: { $ne: "canceled" },
      },
      { $set: { status: "canceled", canceledAt: now } },
    );
  },
};
