const mongoose = require("mongoose");
const {Subscription} = require("../modules/subscription/models/Subscription");

const normalizeId = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return String(v._id || v.id || "");
  return String(v);
};

exports.requireFeature = () => async (req, res, next) => {
  try {
    const vendorId = normalizeId(req.user?.vendorId || req.user?.vendor?._id);
    const userId = normalizeId(req.user?.id || req.user?._id);

    const ids = [vendorId, userId]
      .filter(Boolean)
      .filter((x) => mongoose.Types.ObjectId.isValid(x))
      .map((x) => new mongoose.Types.ObjectId(x));

    if (!ids.length) {
      return res.status(403).json({ error: "Seller account required" });
    }

    const now = new Date();

    const rows = await Subscription.aggregate([
      { $match: { sellerId: { $in: ids } } },
      { $limit: 1 },
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
          pipeline: [{ $project: { isActive: 1 } }],
        },
      },
      { $addFields: { plan: { $first: "$plan" } } },
      {
        $project: {
          status: 1,
          currentPeriodEnd: 1,
          planActive: "$plan.isActive",
        },
      },
    ]);

    const sub = rows[0];
    const ok =
      !!sub &&
      String(sub.status || "").toLowerCase() === "active" &&
      (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > now) &&
      sub.planActive === true;

    if (!ok) {
      return res.status(403).json({ error: "Subscription required", isSubscriptionActive: false });
    }

    next();
  } catch (e) {
    next(e);
  }
};
