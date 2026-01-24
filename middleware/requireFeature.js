const { Subscription } = require("../modules/subscription/models/Subscription");
const { getRedisClient, isRedisAvailable } = require("../config/redis");
const redis = getRedisClient();

exports.requireFeature = function () {
  return async (req, res, next) => {
    try {
      const sellerId = req.user?.vendorId || req.user?.id || req.user?._id;
      if (!sellerId) return res.status(403).json({ error: "Seller account required" });

      const cacheKey = `subcheck:${String(sellerId)}`;

      if (isRedisAvailable()) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const ok = cached === "1";
          if (!ok) return res.status(403).json({ error: "Subscription required", isSubscriptionActive: false });
          return next();
        }
      }

      const sub = await Subscription.findOne({ sellerId })
        .select("status currentPeriodEnd planId")
        .populate({ path: "planId", select: "isActive" })
        .lean();

      const ok =
        !!sub &&
        sub.status === "active" &&
        (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()) &&
        !!sub.planId &&
        sub.planId.isActive === true;

      if (isRedisAvailable()) {
        await redis.set(cacheKey, ok ? "1" : "0", { EX: 60 }); // 60s cache
      }

      if (!ok) return res.status(403).json({ error: "Subscription required", isSubscriptionActive: false });
      next();
    } catch (e) {
      next(e);
    }
  };
};
