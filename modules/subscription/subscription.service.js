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
const VendorWallet = require("../wallet/vendorWallet.model");
const Vendor = require("../vendors/vendors.model.js");
const { isRedisAvailable, getRedisClient } = require("../../config/redis");
const redisClient = getRedisClient();

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
  changePlan:
    "POST http://localhost:3001/v1/sellers/subscription/start-or-change",
  renew: "POST http://localhost:3001/v1/sellers/subscription/renew",
};

const isDiscountActive = (plan) => {
  const dp = Number(plan?.discountPercent || 0);

  if (!dp) return false;
  if (plan?.discountExpiresAt) {
    const d = new Date(plan.discountExpiresAt).getTime();
    return Number.isFinite(d) && d > Date.now();
  }
  return true;
};

const discountedPrice = (plan) => {
  const dp = Number(plan?.discountPercent || 0);
  if (!isDiscountActive(plan)) return plan?.price || 0;
  return Math.max(0, (plan.price || 0) * (1 - dp / 100));
};

const buildStartOrChangeHandler = ({
  sellerId,
  normalizedPlanCode,
  paymentMethod,
  paymentIntentId,
}) => {
  return async () => {
    const plan = await findActivePlanByCode(normalizedPlanCode);
    const now = new Date();

    const expectedAmountPhp =
      Math.round(
        (isDiscountActive(plan) ? discountedPrice(plan) : plan.price) * 100,
      ) / 100;

    const expectedAmountCents = Math.round(expectedAmountPhp * 100);

    const userId = await getUserIdFromSellerId(sellerId);

    // Do external QRPH status check OUTSIDE transaction
    let qrphPayment = null;
    if (plan.price > 0 && paymentMethod === "qrph") {
      if (!paymentIntentId) {
        throw new HttpError(
          400,
          "paymentIntentId is required for QRPH payment confirmation",
        );
      }

      qrphPayment = await paymentService.checkPaymentStatus(paymentIntentId);

      if (qrphPayment?.status !== "succeeded") {
        throw new HttpError(400, "Payment has not completed");
      }

      const meta = qrphPayment.metadata || {};
      const metaSeller = String(
        meta.get ? meta.get("sellerId") : meta.sellerId,
      );
      const metaPlan = String(meta.get ? meta.get("planCode") : meta.planCode);

      if (metaSeller !== String(sellerId)) {
        throw new HttpError(400, "Payment metadata seller mismatch");
      }
      if (metaPlan !== String(normalizedPlanCode)) {
        throw new HttpError(400, "Payment metadata plan mismatch");
      }

      const paymentAmountCents = Number(qrphPayment.amount); // centavos
      if (
        !Number.isFinite(paymentAmountCents) ||
        paymentAmountCents !== expectedAmountCents
      ) {
        throw new HttpError(400, "Payment amount does not match plan price");
      }

      const alreadyUsed =
        (meta.get && meta.get("subscriptionApplied")) ||
        meta.subscriptionApplied;

      if (alreadyUsed) {
        throw new HttpError(400, "Payment already used for a subscription");
      }
    }

    const result = await runInTransaction(async (session) => {
      // 1) WALLET debit must be atomic + conditional
      if (plan.price > 0 && paymentMethod === "wallet") {
        const updatedWallet = await VendorWallet.findOneAndUpdate(
          { user: userId, balance: { $gte: expectedAmountPhp } },
          {
            $inc: { balance: -expectedAmountPhp },
            $push: {
              recentTransactions: {
                type: "debit",
                amount: expectedAmountPhp,
                description: `Subscription payment for plan ${plan.code}`,
                date: now,
              },
            },
          },
          { session, new: true, projection: { balance: 1 } },
        );

        if (!updatedWallet) {
          const w = await VendorWallet.findOne({ user: userId })
            .select("balance")
            .session(session);

          const bal = Number(w?.balance || 0);
          throw new HttpError(
            400,
            `Insufficient wallet balance. Required: ${expectedAmountPhp}, Available: ${bal}`,
          );
        }
      }

      // 2) Subscription write (handle concurrency safely)
      // Always enforce unique index on sellerId in DB to prevent duplicates.
      // Then use upsert for the "create" path to avoid race conditions.

      const existing = await Subscription.findOne({ sellerId }).session(
        session,
      );

      if (!existing) {
        const periodEnd = computePeriodEnd(now, plan.interval);

        const created = await Subscription.findOneAndUpdate(
          { sellerId },
          {
            $setOnInsert: buildNewSubscription({
              sellerId,
              planId: plan._id,
              periodStart: now,
              periodEnd,
            }),
          },
          { session, upsert: true, new: true },
        );

        if (!created?._id)
          throw new HttpError(500, "Subscription creation failed");

        if (plan.price > 0 && paymentMethod === "qrph" && paymentIntentId) {
          const p = await Payment.findOneAndUpdate(
            {
              paymentIntentId,
              $or: [
                { "metadata.subscriptionApplied": { $exists: false } },
                { "metadata.subscriptionApplied": { $ne: "true" } },
              ],
            },
            {
              $set: {
                "metadata.subscriptionApplied": "true",
                "metadata.subscriptionId": created._id.toString(),
              },
            },
            { session, new: true },
          );

          if (!p)
            throw new HttpError(400, "Payment already used for a subscription");
        }

        if (isRedisAvailable()) {
          await redisClient.del(`products:featured:subscribed`).catch(() => {});
          await redisClient.del(`vendor:featured:subscribed`).catch(() => {});
        }

        return { subscription: created };
      }

      const previousPlanId = existing.planId;
      const expired = subscriptionIsExpired(existing, now);

      existing.planId = plan._id;
      markSubscriptionActive(existing);

      addSubscriptionHistory(
        existing,
        "changed",
        previousPlanId,
        plan._id,
        expired
          ? "Changed plan after expiration"
          : "Changed plan mid-cycle (no proration)",
      );

      if (expired) setSubscriptionCycle(existing, now, plan.interval);

      const saved = await existing.save({ session });
      if (!saved?._id) throw new HttpError(500, "Subscription update failed");

      if (plan.price > 0 && paymentMethod === "qrph" && paymentIntentId) {
        const p = await Payment.findOneAndUpdate(
          {
            paymentIntentId,
            $or: [
              { "metadata.subscriptionApplied": { $exists: false } },
              { "metadata.subscriptionApplied": { $ne: "true" } },
            ],
          },
          {
            $set: {
              "metadata.subscriptionApplied": "true",
              "metadata.subscriptionId": saved._id.toString(),
            },
          },
          { session, new: true },
        );

        if (!p)
          throw new HttpError(400, "Payment already used for a subscription");
      }

      if (paymentMethod === "wallet" && isRedisAvailable()) {
        await redisClient.del(`vendor:${userId}`).catch(() => {});
        await redisClient.del(`products:featured:subscribed`).catch(() => {});
        await redisClient.del(`vendor:featured:subscribed`).catch(() => {});
      }

      return { subscription: saved };
    });

    // cache invalidation AFTER txn commit
    if (isRedisAvailable()) {
      await redisClient.del(`vendor:${userId}`).catch(() => {});
      await redisClient.del(`products:featured:subscribed`).catch(() => {});
      await redisClient.del(`vendor:featured:subscribed`).catch(() => {});
    }

    return result;
  };
};

exports.subscriptionService = {
  getBySellerId(sellerId) {
    ensureValidObjectId(sellerId, "sellerId");
    return Subscription.findOne({ sellerId }).populate("planId");
  },

  startOrChangePlan({
    sellerId,
    planCode,
    actorUserId,
    idempotencyKey,
    paymentMethod = "wallet",
    paymentIntentId = undefined,
  }) {
    ensureValidObjectId(sellerId, "sellerId");
    const normalizedPlanCode = normalizePlanCode(planCode);

    return withIdempotency({
      key: idempotencyKey,
      userId: actorUserId,
      route: idempotencyRoutes.changePlan,
      body: {
        sellerId,
        planCode: normalizedPlanCode,
        paymentMethod,
        paymentIntentId,
      },
      handler: buildStartOrChangeHandler({
        sellerId,
        normalizedPlanCode,
        paymentMethod,
        paymentIntentId,
      }),
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
    // Populate plan details and seller details (use Vendor model and nested User for name/email)
    // sellerId stores the User _id (seller account). Populate it directly for name/email.
    return Subscription.find({})
      .populate("planId")
      .populate({ path: "sellerId", model: "User", select: "name email" });
  },

  async getSubscriptionById(id) {
    ensureValidObjectId(id, "id");
    return Subscription.findById(id)
      .populate("planId")
      .populate({ path: "sellerId", model: "User", select: "name email" });
  },

  async updateSubscription(id, updates) {
    ensureValidObjectId(id, "id");
    return Subscription.findByIdAndUpdate(id, updates, { new: true }).populate(
      "planId sellerId",
      "name email",
    );
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

    // Validate updates to keep data consistent and secure
    const sanitized = { ...updates };

    if (sanitized.price !== undefined) {
      const price = Number(sanitized.price);
      if (!Number.isFinite(price) || price < 0)
        throw new HttpError(400, "price must be a non-negative number");
      sanitized.price = price;
    }

    if (sanitized.discountPercent !== undefined) {
      const dp = Number(sanitized.discountPercent);
      if (!Number.isFinite(dp) || dp < 0 || dp > 100)
        throw new HttpError(
          400,
          "discountPercent must be a number between 0 and 100",
        );
      sanitized.discountPercent = dp;
    }

    if (
      sanitized.discountExpiresAt !== undefined &&
      sanitized.discountExpiresAt !== null
    ) {
      const d = new Date(sanitized.discountExpiresAt);
      if (!Number.isFinite(d.getTime()))
        throw new HttpError(
          400,
          "discountExpiresAt must be a valid date or null",
        );
      sanitized.discountExpiresAt = d;
    }

    if (sanitized.features && !Array.isArray(sanitized.features)) {
      // Allow comma separated string for convenience
      if (typeof sanitized.features === "string") {
        sanitized.features = sanitized.features
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        throw new HttpError(
          400,
          "features must be an array of strings or a comma separated string",
        );
      }
    }

    return Plan.findByIdAndUpdate(id, sanitized, { new: true });
  },

  async deletePlan(id) {
    ensureValidObjectId(id, "id");
    return Plan.findByIdAndDelete(id);
  },
};
