const Product = require("../../products/products.model");
const Vendor = require("../vendors.model");
const Order = require("../../orders/orders.model");
const { getRedisClient, isRedisAvailable } = require("../../../config/redis");
const crypto = require("crypto");
const mongoose = require("mongoose");

const redis = getRedisClient();

const dateKey = () => new Date().toISOString().slice(0, 10);

const toISODate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const clampInt = (n, min, max, fallback) => {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
};

const sha1 = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");

const safeObjId = (id) => {
  const s = String(id || "");
  if (!mongoose.Types.ObjectId.isValid(s)) throw new Error("Invalid vendor id");
  return new mongoose.Types.ObjectId(s);
};

const getVisitorId = (req, visitorId) => {
  if (visitorId) return String(visitorId);

  const anonId = req?.cookies?.anonId;
  if (anonId) return String(anonId);

  const ip = req?.ip || "";
  const ua = req?.headers?.["user-agent"] || "";
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
};

const markUnique = async (key, ttlSeconds) => {
  if (!isRedisAvailable()) return true;
  const ok = await redis.set(key, "1", { NX: true, EX: ttlSeconds });
  return ok === "OK";
};

const bustKey = (vendorUserId) => `analytics:bust:${String(vendorUserId)}`;

const bumpAnalyticsCache = async (vendorUserId) => {
  if (!isRedisAvailable()) return;
  try {
    await redis.incr(bustKey(vendorUserId));
    await redis.expire(bustKey(vendorUserId), 60 * 60 * 24 * 14);
  } catch (_) {}
};

const getBust = async (vendorUserId) => {
  if (!isRedisAvailable()) return "0";
  try {
    const v = await redis.get(bustKey(vendorUserId));
    return v || "0";
  } catch (_) {
    return "0";
  }
};

const analyticsCacheKey = async (vendorUserId, opts) => {
  const bust = await getBust(vendorUserId);
  const normalized = {
    vendorUserId: String(vendorUserId),
    startDate: toISODate(opts.startDate),
    endDate: toISODate(opts.endDate),
    limitProducts: clampInt(opts.limitProducts, 1, 50, 8),
    limitCustomers: clampInt(opts.limitCustomers, 1, 50, 6),
    limitLocations: clampInt(opts.limitLocations, 1, 50, 6),
  };
  return `analytics:data:${normalized.vendorUserId}:${bust}:${sha1(JSON.stringify(normalized))}`;
};

const withAnalyticsCache = async (vendorUserId, opts, computeFn) => {
  const ttlSec = clampInt(opts.cacheTtlSec, 10, 3600, 120);
  const noCache = Boolean(opts.noCache);

  if (!isRedisAvailable() || noCache) return computeFn();

  const key = await analyticsCacheKey(vendorUserId, opts);

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const lockKey = `${key}:lock`;
  let locked = false;

  try {
    const ok = await redis.set(lockKey, "1", { NX: true, EX: 15 });
    locked = ok === "OK";
  } catch (_) {}

  if (!locked) {
    try {
      await new Promise((r) => setTimeout(r, 120));
      const cached2 = await redis.get(key);
      if (cached2) return JSON.parse(cached2);
    } catch (_) {}
    return computeFn();
  }

  try {
    const data = await computeFn();
    try {
      await redis.set(key, JSON.stringify(data), { EX: ttlSec });
    } catch (_) {}
    return data;
  } finally {
    try {
      await redis.del(lockKey);
    } catch (_) {}
  }
};

exports.trackProductView = async ({ productId, visitorId, vendorUserId }) => {
  const inc = { views: 1 };
  const uniqueKey = `uv:product:${productId}:${visitorId}:${dateKey()}`;
  const isUnique = visitorId ? await markUnique(uniqueKey, 60 * 60 * 24) : false;

  if (isUnique) inc.uniqueViews = 1;

  await Product.findByIdAndUpdate(productId, { $inc: inc }, { new: false });
  await Vendor.updateOne({ userId: vendorUserId }, { $inc: inc });

  await bumpAnalyticsCache(vendorUserId);

  return { viewed: true, unique: isUnique };
};

exports.trackVendorView = async ({ vendorUserId, visitorId }) => {
  const inc = { views: 1 };
  const uniqueKey = `uv:vendor:${vendorUserId}:${visitorId}:${dateKey()}`;
  const isUnique = visitorId ? await markUnique(uniqueKey, 60 * 60 * 24) : false;

  if (isUnique) inc.uniqueViews = 1;

  await Vendor.updateOne({ userId: vendorUserId }, { $inc: inc });

  await bumpAnalyticsCache(vendorUserId);

  return { viewed: true, unique: isUnique };
};




exports.getAnalyticsData = async (vendorUserId, opts = {}) => {
  return withAnalyticsCache(vendorUserId, opts, async () => {
    try {
      const vendorObjId = safeObjId(vendorUserId);

      const limitProducts = clampInt(opts.limitProducts, 1, 50, 8);
      const limitCustomers = clampInt(opts.limitCustomers, 1, 50, 6);
      const limitLocations = clampInt(opts.limitLocations, 1, 50, 6);

      const PLATFORM_RATE = 0.07;
      const SELLER_RATE = 0.93;

      const match = { vendorId: vendorObjId, status: "delivered" };
      if (opts.startDate || opts.endDate) {
        match.createdAt = {};
        if (opts.startDate) match.createdAt.$gte = new Date(opts.startDate);
        if (opts.endDate) match.createdAt.$lte = new Date(opts.endDate);
      }

      const r2 = (expr) => ({ $round: [expr, 2] });

      const pipeline = [
        { $match: match },

        {
          $project: {
            customerId: 1,
            name: 1,
            shippingAddress: 1,
            subTotal: { $ifNull: ["$subTotal", 0] },
            createdAt: 1,
            items: { $ifNull: ["$items", []] },
          },
        },

        {
          $facet: {
            products: [
              { $unwind: "$items" },
              {
                $project: {
                  productId: "$items.productId",
                  qty: { $ifNull: ["$items.quantity", 1] },
                  unitPrice: { $ifNull: ["$items.price", 0] },
                },
              },
              {
                $project: {
                  productId: 1,
                  sold: "$qty",
                  grossLine: { $multiply: ["$unitPrice", "$qty"] },
                },
              },
              {
                $group: {
                  _id: "$productId",
                  sold: { $sum: "$sold" },
                  grossRaw: { $sum: "$grossLine" },
                },
              },
              {
                $addFields: {
                  grossRevenue: r2("$grossRaw"),
                  platformCommission: r2({ $multiply: ["$grossRaw", PLATFORM_RATE] }),
                  sellerRevenue: r2({ $multiply: ["$grossRaw", SELLER_RATE] }),
                },
              },
              {
                $lookup: {
                  from: "products",
                  let: { pid: "$_id" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$pid"] } } },
                    { $project: { name: 1, categories: 1, views: 1, uniqueViews: 1 } },
                  ],
                  as: "product",
                },
              },
              { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  id: { $toString: "$_id" },
                  name: { $ifNull: ["$product.name", "Unnamed"] },
                  category: {
                    $ifNull: [
                      { $arrayElemAt: [{ $ifNull: ["$product.categories", []] }, 0] },
                      "General",
                    ],
                  },
                  views: { $ifNull: ["$product.views", 0] },
                  uniqueViews: { $ifNull: ["$product.uniqueViews", 0] },
                  sold: 1,
                  grossRevenue: 1,
                  platformCommission: 1,
                  sellerRevenue: 1,
                },
              },
              { $sort: { sellerRevenue: -1, sold: -1, views: -1 } },
              { $limit: limitProducts },
            ],

            customers: [
              {
                $group: {
                  _id: "$customerId",
                  name: { $first: { $ifNull: ["$name", "Guest"] } },
                  location: { $first: { $ifNull: ["$shippingAddress.city", "Unknown"] } },
                  orders: { $sum: 1 },
                  grossRaw: { $sum: "$subTotal" },
                  lastOrderAt: { $max: "$createdAt" },
                },
              },
              {
                $addFields: {
                  grossSpend: r2("$grossRaw"),
                  platformCommission: r2({ $multiply: ["$grossRaw", PLATFORM_RATE] }),
                  sellerRevenue: r2({ $multiply: ["$grossRaw", SELLER_RATE] }),
                },
              },
              {
                $project: {
                  id: { $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, "guest"] },
                  name: 1,
                  location: 1,
                  orders: 1,
                  grossSpend: 1,
                  platformCommission: 1,
                  sellerRevenue: 1,
                  lastOrderAt: 1,
                },
              },
              { $sort: { sellerRevenue: -1, orders: -1 } },
              { $limit: limitCustomers },
            ],

            locations: [
              {
                $project: {
                  city: { $ifNull: ["$shippingAddress.city", "Unknown"] },
                  amount: "$subTotal",
                },
              },
              {
                $group: {
                  _id: "$city",
                  orders: { $sum: 1 },
                  grossRaw: { $sum: "$amount" },
                },
              },
              {
                $addFields: {
                  grossRevenue: r2("$grossRaw"),
                  platformCommission: r2({ $multiply: ["$grossRaw", PLATFORM_RATE] }),
                  sellerRevenue: r2({ $multiply: ["$grossRaw", SELLER_RATE] }),
                },
              },
              {
                $project: {
                  location: "$_id",
                  orders: 1,
                  grossRevenue: 1,
                  platformCommission: 1,
                  sellerRevenue: 1,
                },
              },
              { $sort: { sellerRevenue: -1, orders: -1 } },
              { $limit: limitLocations },
            ],

            totals: [
              {
                $project: {
                  subTotal: 1,
                  itemsSold: {
                    $sum: {
                      $map: {
                        input: "$items",
                        as: "it",
                        in: { $ifNull: ["$$it.quantity", 1] },
                      },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  grossRaw: { $sum: "$subTotal" },
                  totalSold: { $sum: "$itemsSold" },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalOrders: 1,
                  totalSold: 1,
                  totalGrossRevenue: r2("$grossRaw"),
                  totalPlatformCommission: r2({ $multiply: ["$grossRaw", PLATFORM_RATE] }),
                  totalSellerRevenue: r2({ $multiply: ["$grossRaw", SELLER_RATE] }),
                },
              },
            ],
          },
        },

        {
          $project: {
            products: 1,
            customers: 1,
            locations: 1,
            totals: { $ifNull: [{ $arrayElemAt: ["$totals", 0] }, {}] },
          },
        },
      ];

      const [result] = await Order.aggregate(pipeline).allowDiskUse(true);

      const totals = {
        totalProducts: result?.products?.length || 0,
        totalCustomers: result?.customers?.length || 0,
        totalLocations: result?.locations?.length || 0,
        ...(result?.totals || {}),
      };

      return {
        products: result?.products || [],
        customers: result?.customers || [],
        locations: result?.locations || [],
        totals,
        rates: { platform: PLATFORM_RATE, seller: SELLER_RATE },
      };
    } catch (err) {
      console.error("Get Analytics Data Error:", err);
      throw new Error("Failed to fetch analytics data");
    }
  });
};



exports.getVisitorId = getVisitorId;
exports.bumpAnalyticsCache = bumpAnalyticsCache;
