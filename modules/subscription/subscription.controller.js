// controllers/subscriptionController.js
const { HttpError } = require("./utils/subscriptionErrors.js");
const { subscriptionService } = require("./subscription.service.js");

const getIdempotencyKey = (req) => {
  const headerValue = req.header("Idempotency-Key");
  return typeof headerValue === "string" && headerValue.trim()
    ? headerValue.trim()
    : undefined;
};

const requireSellerAccount = (req) => {
  const sellerId = req.user?.id || req.user?._id;
  console.log("Seller IDdsssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss:", sellerId);
  if (!sellerId) throw new HttpError(403, "Seller account required");
  return sellerId;
};

exports.subscriptionController = {
  async getMySubscription(req, res) {
    const sellerId = requireSellerAccount(req);
    const subscription = await subscriptionService.getBySellerId(sellerId);
    res.json({ subscription });
  },

  async startOrChangePlan(req, res) {
    const sellerId = requireSellerAccount(req);
    const { planCode, paymentMethod = 'wallet', paymentIntentId } = req.body;

    if (!planCode) {
      throw new HttpError(400, "planCode is required");
    }

    const result = await subscriptionService.startOrChangePlan({
      sellerId,
      planCode: planCode,
      actorUserId: sellerId,
      idempotencyKey: getIdempotencyKey(req),
      paymentMethod,
      paymentIntentId,
    });

    res.json(result);
  },

  async renew(req, res) {
    const sellerId = requireSellerAccount(req);

    const result = await subscriptionService.renew({
      sellerId,
      actorUserId: sellerId,
      idempotencyKey: getIdempotencyKey(req),
    });

    res.json(result);
  },

  async cancelAtPeriodEnd(req, res) {
    const sellerId = requireSellerAccount(req);
    const result = await subscriptionService.cancelAtPeriodEnd({ sellerId });
    res.json(result);
  },

  // Admin methods
  async getAllSubscriptions(req, res) {
    const subscriptions = await subscriptionService.getAllSubscriptions();
    res.json({ subscriptions });
  },

  async getSubscriptionById(req, res) {
    const { id } = req.params;
    const subscription = await subscriptionService.getSubscriptionById(id);
    res.json({ subscription });
  },

  async updateSubscription(req, res) {
    const { id } = req.params;
    const updates = { ...req.body };

    // Allow admin to pass planCode (convenience) — resolve to planId
    if (updates.planCode) {
      const normalized = (updates.planCode || '').trim().toLowerCase();
      if (!normalized) throw new HttpError(400, 'planCode cannot be empty');
      // look up plan directly using Plan model
      const Plan = require('./models/Plan.js').Plan;
      const planDoc = await Plan.findOne({ code: normalized, isActive: true });
      if (!planDoc) throw new HttpError(404, 'Plan not found or inactive');
      updates.planId = planDoc._id;
      delete updates.planCode;
    }

    const subscription = await subscriptionService.updateSubscription(id, updates);
    res.json({ subscription });
  },

  async deleteSubscription(req, res) {
    const { id } = req.params;
    await subscriptionService.deleteSubscription(id);
    res.json({ success: true, message: "Subscription deleted" });
  },

  async getAllPlans(req, res) {
    const plans = await subscriptionService.getAllPlans();
    console.log("planoooooooooooooooooooooooooooooooooooooooooooo", plans);
    res.json({ plans });
  },

  async createPlan(req, res) {
    const planData = req.body;
    const plan = await subscriptionService.createPlan(planData);
    res.json({ plan });
  },

  async updatePlan(req, res) {
    const { id } = req.params;
    const updates = req.body;
    const plan = await subscriptionService.updatePlan(id, updates);
    res.json({ plan });
  },

  async deletePlan(req, res) {
    const { id } = req.params;
    await subscriptionService.deletePlan(id);
    res.json({ success: true, message: "Plan deleted" });
  },
};
