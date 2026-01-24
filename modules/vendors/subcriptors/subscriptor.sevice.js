const Product = require("../../products/products.model");
const Vendor = require("../vendors.model");
const Order = require("../../orders/orders.model");
const { getRedisClient, isRedisAvailable } = require("../../../config/redis");
const crypto = require("crypto");
const redis = getRedisClient();
const mongoose = require("mongoose");

const dateKey = () => new Date().toISOString().slice(0, 10);

const getVisitorId = (visitorId) => {

  if (visitorId) return String(visitorId);

  const anonId = req.cookies?.anonId;
  if (anonId) return String(anonId);

  const ip = req.ip || "";
  const ua = req.headers["user-agent"] || "";
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
};

const markUnique = async (key, ttlSeconds) => {
  if (!isRedisAvailable()) return true;
  console.log("✅ markUnique key:", key, "ttlSeconds:", ttlSeconds);
  const ok = await redis.set(key, "1", { NX: true, EX: ttlSeconds });
  return ok === "OK";
};

exports.trackProductView = async ({ productId, visitorId, vendorUserId }) => {
  const inc = { views: 1 };
  const uniqueKey = `uv:product:${productId}:${visitorId}:${dateKey()}`;
  const isUnique = visitorId
    ? await markUnique(uniqueKey, 60 * 60 * 24)
    : false;


  if (isUnique) inc.uniqueViews = 1;
  const products = await Product.findByIdAndUpdate(productId, { $inc: inc });
  await Vendor.updateOne({ userId: vendorUserId }, { $inc: inc });
  console.log("✅ trackProductView:", products);
  return { viewed: true, unique: isUnique };
};

exports.trackVendorView = async ({ vendorUserId, visitorId }) => {
  const inc = { profileViews: 1 };
  const uniqueKey = `uv:vendor:${vendorUserId}:${visitorId}:${dateKey()}`;
  const isUnique = visitorId
    ? await markUnique(uniqueKey, 60 * 60 * 24)
    : false;
  if (isUnique) inc.uniqueProfileViews = 1;
  await Vendor.updateOne({ userId: vendorUserId }, { $inc: inc });
  return { viewed: true, unique: isUnique };
};

exports.getAnalyticsData = async (vendorUserId, opts = {}) => {
  try {
    const { startDate, endDate, limitProducts = 8, limitCustomers = 6, limitLocations = 6 } = opts;

    const match = {
      vendorId: mongoose.Types.ObjectId(String(vendorUserId)),
    };
    
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    // --- Products aggregation: sold & revenue from orders, enrich from products collection (name, category, views) ---
    const productsPipeline = [
      { $match: match },
      // Normalize order items into `products` array (handles both items[] and single-product orders)
      {
        $project: {
          products: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
              "$items",
              [{ productId: "$productId", quantity: { $ifNull: ["$quantity", 1] }, price: { $ifNull: ["$totalPrice", 0] } }],
            ],
          },
        },
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productId",
          sold: { $sum: { $ifNull: ["$products.quantity", 1] } },
          revenue: { $sum: { $ifNull: ["$products.price", 0] } },
        },
      },
      // Join product metadata (name, category, views, uniqueViews)
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: { $toString: "$_id" },
          name: "$product.name",
          category: "$product.category",
          views: { $ifNull: ["$product.views", 0] },
          uniqueViews: { $ifNull: ["$product.uniqueViews", 0] },
          sold: 1,
          revenue: 1,
        },
      },
      { $sort: { views: -1, revenue: -1 } },
      { $limit: limitProducts },
    ];

    const productsAgg = await Order.aggregate(productsPipeline).allowDiskUse(true);

    // --- Customers aggregation: top customers by spend ---
    const customersPipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            buyerId: { $ifNull: ["$buyerId", "$userId"] },
            name: { $first: { $ifNull: ["$buyerName", "$customerName", "$shipping.name", null] } },
            location: { $first: { $ifNull: ["$shipping.city", "$shipping.address.city", null] } },
          },
          orders: { $sum: 1 },
          spend: { $sum: { $ifNull: ["$totalPrice", 0] } },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          id: { $toString: "$_id.buyerId" },
          name: { $ifNull: ["$_id.name", "Guest"] },
          location: { $ifNull: ["$_id.location", "Unknown"] },
          orders: 1,
          spend: 1,
          lastOrderAt: 1,
        },
      },
      { $sort: { spend: -1, orders: -1 } },
      { $limit: limitCustomers },
    ];

    const customersAgg = await Order.aggregate(customersPipeline).allowDiskUse(true);

    // --- Locations aggregation: orders & revenue per city ---
    const locationsPipeline = [
      { $match: match },
      {
        $project: {
          city: { $ifNull: ["$shipping.city", "$shipping.address.city", "Unknown"] },
          totalPrice: { $ifNull: ["$totalPrice", 0] },
        },
      },
      {
        $group: {
          _id: "$city",
          orders: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
      {
        $project: {
          location: "$_id",
          orders: 1,
          revenue: 1,
        },
      },
      { $sort: { orders: -1, revenue: -1 } },
      { $limit: limitLocations },
    ];

    const locationsAgg = await Order.aggregate(locationsPipeline).allowDiskUse(true);

    // Totals
    const totals = {
      totalProducts: productsAgg.length,
      totalCustomers: customersAgg.length,
      totalLocations: locationsAgg.length,
      totalRevenue: productsAgg.reduce((s, p) => s + (p.revenue || 0), 0),
      totalViews: productsAgg.reduce((s, p) => s + (p.views || 0), 0),
      totalUniqueViews: productsAgg.reduce((s, p) => s + (p.uniqueViews || 0), 0),
      totalSold: productsAgg.reduce((s, p) => s + (p.sold || 0), 0),
    };

    return {
      products: productsAgg,
      customers: customersAgg,
      locations: locationsAgg,
      totals,
    };
  } catch (err) {
    console.error("Get Analytics Data Error:", err);
    throw new Error("Failed to fetch analytics data");
  }
};

exports.getVisitorId = getVisitorId;
