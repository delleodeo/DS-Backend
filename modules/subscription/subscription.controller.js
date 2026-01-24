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
  console.log("Seller ID:", sellerId);
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
    const { planCode } = req.body;

    if (!planCode) {
      throw new HttpError(400, "planCode is required");
    }

    const result = await subscriptionService.startOrChangePlan({
      sellerId,
      planCode: planCode,
      actorUserId: sellerId,
      idempotencyKey: getIdempotencyKey(req),
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
};
