import { Subscription } from "../models/Subscription.js";
import { Plan } from "../models/Plan.js";

export function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const sellerId = req.user?.sellerId;
      if (!sellerId) return res.status(403).json({ error: "Seller account required" });

      const sub = await Subscription.findOne({ sellerId });
      if (!sub) return res.status(403).json({ error: "No subscription" });
      if (sub.status !== "active") return res.status(403).json({ error: "Subscription not active" });
      if (sub.currentPeriodEnd <= new Date()) return res.status(403).json({ error: "Subscription expired" });

      const plan = await Plan.findById(sub.planId);
      if (!plan || !plan.isActive) return res.status(403).json({ error: "Plan not available" });

      const allowed = plan.limits?.[featureKey];
      if (!allowed) return res.status(403).json({ error: "Feature not included in your plan" });

      next();
    } catch (e) {
      next(e);
    }
  };
}
