const mongoose = require("mongoose");
const { Plan } = require("./models/Plan.js");
const { Subscription } = require("./models/Subscription");
const {
  HttpError,
  computePeriodEnd,
} = require("./utils/subscriptionErrors.js");
const { withIdempotency } = require("./idempotency.service.js");
const paymentService = require("../payments/payments.service.js");
const Payment = require("../payments/payments.model.js");
const walletService = require("../wallet/wallet.service.js");
const Vendor = require("../vendors/vendors.model.js");

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

const getUserIdFromSellerId = async (sellerId) => {
  const vendor = await Vendor.findOne({ userId: sellerId });
  if (!vendor) throw new HttpError(404, "Seller not found");
  return vendor.userId;
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

const buildStartOrChangeHandler = ({ sellerId, normalizedPlanCode, paymentMethod, paymentIntentId }) => {
  return () =>
    runInTransaction(async (session) => {
      const plan = await findActivePlanByCode(normalizedPlanCode);
      const now = new Date();

      // Get userId for payment
      const userId = await getUserIdFromSellerId(sellerId);

      // Handle payment if plan has price
      if (plan.price > 0) {
        if (paymentMethod === 'wallet') {
          // Check balance
          const balance = await walletService.getBalance(userId);
          if (balance < plan.price) {
            throw new HttpError(400, `Insufficient wallet balance. Required: ${plan.price}, Available: ${balance}`);
          }
          // Deduct from wallet
          await walletService.debitWallet(userId, plan.price, {
            description: `Subscription payment for ${plan.name}`,
            referenceType: 'subscription',
            referenceId: sellerId,
            session
          });
        } else if (paymentMethod === 'qrph') {
          // Validate payment intent and ensure it was completed for this seller/plan
          if (!paymentIntentId) {
            throw new HttpError(400, 'paymentIntentId is required for QRPH payment confirmation');
          }

          const payment = await paymentService.checkPaymentStatus(paymentIntentId);

          if (payment.status !== 'succeeded') {
            throw new HttpError(400, 'Payment has not completed');
          }

          // Verify metadata
          const meta = payment.metadata || {};
          const metaSeller = String(meta.get ? meta.get('sellerId') : meta.sellerId);
          const metaPlan = String(meta.get ? meta.get('planCode') : meta.planCode);

          if (metaSeller !== String(sellerId)) {
            throw new HttpError(400, 'Payment metadata seller mismatch');
          }

          if (metaPlan !== String(normalizedPlanCode)) {
            throw new HttpError(400, 'Payment metadata plan mismatch');
          }

          // Verify amount matches plan price (in centavos)
          const expectedAmount = Math.round(plan.price * 100);
          if (payment.amount !== expectedAmount) {
            throw new HttpError(400, 'Payment amount does not match plan price');
          }

          // Prevent reuse
          const alreadyUsed = (meta.get && meta.get('subscriptionApplied')) || meta.subscriptionApplied;
          if (alreadyUsed) {
            throw new HttpError(400, 'Payment already used for a subscription');
          }

          // We'll mark payment used after subscription is saved (below)
        } else {
          throw new HttpError(400, 'Invalid payment method');
        }
      }

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

        // If QRPH, mark payment as used
        if (paymentMethod === 'qrph' && paymentIntentId) {
          await Payment.findOneAndUpdate(
            { paymentIntentId },
            { $set: { 'metadata.subscriptionApplied': 'true', 'metadata.subscriptionId': createdSubscription._id.toString() } },
            { session },
          );
        }

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

      // If QRPH, mark payment as used and reference the subscription
      if (paymentMethod === 'qrph' && paymentIntentId) {
        await Payment.findOneAndUpdate(
          { paymentIntentId },
          { $set: { 'metadata.subscriptionApplied': 'true', 'metadata.subscriptionId': subscription._id.toString() } },
          { session },
        );
      }

      return { subscription };
    });
};

exports.subscriptionService = {
  getBySellerId(sellerId) {
    ensureValidObjectId(sellerId, "sellerId");
    return Subscription.findOne({ sellerId }).populate("planId");
  },

  startOrChangePlan({ sellerId, planCode, actorUserId, idempotencyKey, paymentMethod = 'wallet', paymentIntentId = undefined }) {
    ensureValidObjectId(sellerId, "sellerId");
    const normalizedPlanCode = normalizePlanCode(planCode);

    return withIdempotency({
      key: idempotencyKey,
      userId: actorUserId,
      route: idempotencyRoutes.changePlan,
      body: { sellerId, planCode: normalizedPlanCode, paymentMethod, paymentIntentId },
      handler: buildStartOrChangeHandler({ sellerId, normalizedPlanCode, paymentMethod, paymentIntentId }),
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

  // Admin methods
  async getAllSubscriptions() {
    return Subscription.find({}).populate("planId sellerId", "name email");
  },

  async getSubscriptionById(id) {
    ensureValidObjectId(id, "id");
    return Subscription.findById(id).populate("planId sellerId", "name email");
  },

  async updateSubscription(id, updates) {
    ensureValidObjectId(id, "id");
    return Subscription.findByIdAndUpdate(id, updates, { new: true }).populate("planId sellerId", "name email");
  },

  async deleteSubscription(id) {
    ensureValidObjectId(id, "id");
    return Subscription.findByIdAndDelete(id);
  },

  async getAllPlans() {
    return Plan.find({});
  },

  async createPlan(planData) {
    const plan = new Plan(planData);
    return plan.save();
  },

  async updatePlan(id, updates) {
    ensureValidObjectId(id, "id");
    return Plan.findByIdAndUpdate(id, updates, { new: true });
  },

  async deletePlan(id) {
    ensureValidObjectId(id, "id");
    return Plan.findByIdAndDelete(id);
  },
};
