// Admin Service - Comprehensive Admin Dashboard Services
const User = require("../../users/users.model");
const Product = require("../../products/products.model");
const Order = require("../../orders/orders.model");
const Vendor = require("../../vendors/vendors.model");
const Admin = require("../admin.model");
const Municipality = require("../models/municipality.model");
const {
  AuditLog,
  SystemSettings,
  Announcement,
  Banner,
  RefundRequest,
  Category,
  UserActivityLog,
} = require("../models");
const {
  getRedisClient,
  isRedisAvailable,
  safeDel,
} = require("../../../config/redis");

const redisClient = getRedisClient();
const CACHE_TTL = 300; // 5 minutes

// Product meta service for keeping category & municipality lists in sync with admin actions
const productMetaService = require("../../products/productMeta.service");

// Cache key helpers (aligned with orders.service)
const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;

// ============================================
// AUDIT LOGGING SERVICE
// ============================================
class AuditService {
  static async log(
    adminId,
    adminEmail,
    action,
    targetType,
    targetId,
    details = {},
    req = null,
  ) {
    try {
      // Resolve adminEmail if not provided
      let resolvedEmail = adminEmail;
      if (!resolvedEmail && adminId) {
        try {
          const user = await User.findById(adminId).select("email");
          resolvedEmail = user?.email;
        } catch (err) {
          // ignore lookup errors and fall back
        }
      }

      // Ensure we always have a non-empty adminEmail to satisfy schema
      if (!resolvedEmail) {
        resolvedEmail = String(adminId) || "unknown";
      }

      const logEntry = new AuditLog({
        adminId,
        adminEmail: resolvedEmail,
        action,
        targetType,
        targetId,
        details,
        previousValues: details.previousValues,
        newValues: details.newValues,
        notes: details.notes,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.headers?.["user-agent"],
      });
      await logEntry.save();
      return logEntry;
    } catch (error) {
      console.error("Audit log error:", error);
      // Don't throw - audit logging shouldn't break main operations
    }
  }

  static async getAuditLogs(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const query = {};

    if (filters.adminId) query.adminId = filters.adminId;
    if (filters.action) query.action = filters.action;
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId) query.targetId = filters.targetId;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("adminId", "name email"),
      AuditLog.countDocuments(query),
    ]);

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

// ============================================
// USER MANAGEMENT SERVICE
// ============================================
class UserManagementService {
  static async getAllUsers(filters = {}, pagination = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      status,
    } = { ...filters, ...pagination };
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (role) query.role = role;
    if (status === "restricted") query.isRestricted = true;
    if (status === "active") query.isRestricted = { $ne: true };
    if (status === "flagged") query.isFlagged = true;

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getUserById(userId) {
    const user = await User.findById(userId).select("-password");
    if (!user) throw new Error("User not found");

    // Get additional stats
    const [orderCount, reviewCount] = await Promise.all([
      Order.countDocuments({ customerId: userId }),
      Product.aggregate([
        { $unwind: "$reviews" },
        { $match: { "reviews.userId": user._id } },
        { $count: "count" },
      ]),
    ]);

    return {
      ...user.toObject(),
      stats: {
        totalOrders: orderCount,
        totalReviews: reviewCount[0]?.count || 0,
      },
    };
  }

  static async restrictUser(userId, adminId, adminEmail, reason, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const previousValues = { isRestricted: user.isRestricted };

    user.isRestricted = true;
    user.restrictionReason = reason;
    user.restrictedAt = new Date();
    user.restrictedBy = adminId;
    await user.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "USER_RESTRICTED",
      "User",
      userId,
      {
        previousValues,
        newValues: { isRestricted: true, reason },
        notes: reason,
      },
      req,
    );

    return user;
  }

  static async unrestrictUser(userId, adminId, adminEmail, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const previousValues = { isRestricted: user.isRestricted };

    user.isRestricted = false;
    user.restrictionReason = null;
    user.restrictedAt = null;
    user.restrictedBy = null;
    await user.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "USER_UNRESTRICTED",
      "User",
      userId,
      {
        previousValues,
        newValues: { isRestricted: false },
      },
      req,
    );

    return user;
  }

  static async changeUserRole(userId, newRole, adminId, adminEmail, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const previousRole = user.role;
    user.role = newRole;
    await user.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "USER_ROLE_CHANGED",
      "User",
      userId,
      {
        previousValues: { role: previousRole },
        newValues: { role: newRole },
      },
      req,
    );

    return user;
  }

  static async flagUser(userId, reason, adminId, adminEmail, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    user.isFlagged = true;
    user.flagReason = reason;
    user.flaggedAt = new Date();
    user.flaggedBy = adminId;
    await user.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "USER_FLAGGED",
      "User",
      userId,
      {
        newValues: { isFlagged: true, reason },
      },
      req,
    );

    return user;
  }

  static async unflagUser(userId, adminId, adminEmail, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    user.isFlagged = false;
    user.flagReason = null;
    user.flaggedAt = null;
    user.flaggedBy = null;
    await user.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "USER_UNFLAGGED",
      "User",
      userId,
      {
        newValues: { isFlagged: false },
      },
      req,
    );

    return user;
  }

  static async getUserActivityLogs(userId, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;

    const [logs, total] = await Promise.all([
      UserActivityLog.find({ userId })
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      UserActivityLog.countDocuments({ userId }),
    ]);

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

// ============================================
// SELLER MANAGEMENT SERVICE
// ============================================
class SellerManagementService {
  static async getAllSellers(filters = {}, pagination = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
    } = { ...filters, ...pagination };
    // Query for users who are vendors OR have submitted seller applications
    const query = {
      $or: [{ role: "vendor" }, { sellerApplication: { $exists: true } }],
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { "sellerApplication.shopName": { $regex: search, $options: "i" } },
      ];
    }

    // Add status filtering
    if (status === "active") {
      query.isRestricted = { $ne: true };
    } else if (status === "restricted") {
      query.isRestricted = true;
    }

    const [sellers, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ]);

    console.log(
      `Found ${sellers.length} sellers with query:`,
      JSON.stringify(query),
    );

    // Get performance metrics for each seller
    const sellersWithMetrics = await Promise.all(
      sellers.map(async (seller) => {
        try {
          const vendor = await Vendor.findOne({ userId: seller._id });
          const vendorId = vendor?._id;

          // Query orders by both vendor._id and user._id since vendorId in orders could be either
          const orderQuery = vendorId
            ? { $or: [{ vendorId: vendorId }, { vendorId: seller._id }] }
            : { vendorId: seller._id };

          // Product query: try both vendor._id and user._id since products might reference either
          // Only count APPROVED products
          const productQuery = vendorId
            ? {
                $or: [{ vendorId: vendorId }, { vendorId: seller._id }],
                status: "approved",
                isDisabled: { $ne: true },
              }
            : {
                vendorId: seller._id,
                status: "approved",
                isDisabled: { $ne: true },
              };

          const [productCount, orders, avgRating] = await Promise.all([
            Product.countDocuments(productQuery),
            Order.find(orderQuery).select("status subTotal"),
            Product.aggregate([
              { $match: { ...productQuery, averageRating: { $gt: 0 } } },
              { $group: { _id: null, avgRating: { $avg: "$averageRating" } } },
            ]),
          ]);

          const completedOrders = orders.filter(
            (o) => o.status === "delivered",
          ).length;
          const cancelledOrders = orders.filter(
            (o) => o.status === "cancelled",
          ).length;
          const totalRevenue = orders
            .filter((o) => o.status === "delivered")
            .reduce((sum, o) => sum + (o.subTotal || 0), 0);

          return {
            ...seller.toObject(),
            vendorId,
            metrics: {
              totalProducts: productCount,
              totalOrders: orders.length,
              completedOrders,
              cancelledOrders,
              cancellationRate: orders.length
                ? ((cancelledOrders / orders.length) * 100).toFixed(2)
                : 0,
              totalRevenue,
              averageRating:
                vendor && vendor.numRatings > 0
                  ? parseFloat((vendor.rating / vendor.numRatings).toFixed(2))
                  : 0,
            },
          };
        } catch (error) {
          console.error(
            `Error calculating metrics for seller ${seller._id}:`,
            error,
          );
          // Return seller with empty metrics if calculation fails
          return {
            ...seller.toObject(),
            metrics: {
              totalProducts: 0,
              totalOrders: 0,
              completedOrders: 0,
              cancelledOrders: 0,
              cancellationRate: 0,
              totalRevenue: 0,
              averageRating: 0,
            },
          };
        }
      }),
    );

    console.log(
      `Sample seller with metrics:`,
      sellersWithMetrics[0]
        ? {
            name: sellersWithMetrics[0].name,
            email: sellersWithMetrics[0].email,
            metrics: sellersWithMetrics[0].metrics,
          }
        : "No sellers found",
    );

    return {
      sellers: sellersWithMetrics,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getSellerPerformance(sellerId) {
    const user = await User.findById(sellerId);
    if (!user || user.role !== "vendor") throw new Error("Seller not found");

    const vendor = await Vendor.findOne({ userId: sellerId });
    if (!vendor) throw new Error("Vendor profile not found");

    const [products, approvedProducts, orders, reviews] = await Promise.all([
      Product.find({ vendorId: vendor._id }),
      Product.find({
        vendorId: vendor._id,
        status: "approved",
        isDisabled: { $ne: true },
      }),
      Order.find({ vendorId: vendor._id }),
      Product.aggregate([
        { $match: { vendorId: vendor._id } },
        { $unwind: "$reviews" },
        { $project: { review: "$reviews" } },
      ]),
    ]);

    const completedOrders = orders.filter((o) => o.status === "delivered");
    const cancelledOrders = orders.filter((o) => o.status === "cancelled");
    const totalRevenue = completedOrders.reduce(
      (sum, o) => sum + (o.subTotal || 0),
      0,
    );
    const platformCommission = totalRevenue * 0.07;

    // Monthly breakdown
    const monthlyData = {};
    completedOrders.forEach((order) => {
      const month = new Date(order.createdAt).toISOString().slice(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { orders: 0, revenue: 0 };
      monthlyData[month].orders++;
      monthlyData[month].revenue += order.subTotal || 0;
    });

    return {
      seller: user.toObject(),
      vendor: vendor.toObject(),
      performance: {
        totalProducts: approvedProducts.length, // Show only approved
        activeProducts: approvedProducts.length, // Same as approved
        pendingProducts: products.filter(
          (p) => p.status === "pending_review" || (!p.status && !p.isApproved),
        ).length,
        rejectedProducts: products.filter((p) => p.status === "rejected")
          .length,
        totalOrders: orders.length,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
        cancellationRate: orders.length
          ? ((cancelledOrders.length / orders.length) * 100).toFixed(2)
          : 0,
        totalRevenue,
        platformCommission,
        netEarnings: totalRevenue - platformCommission,
        totalReviews: reviews.length,
        averageRating: reviews.length
          ? (
              reviews.reduce((sum, r) => sum + r.review.rating, 0) /
              reviews.length
            ).toFixed(2)
          : 0,
        monthlyBreakdown: Object.entries(monthlyData)
          .map(([month, data]) => ({
            month,
            ...data,
          }))
          .sort((a, b) => b.month.localeCompare(a.month)),
      },
    };
  }
}

// ============================================
// PRODUCT MANAGEMENT SERVICE
// ============================================
class ProductManagementService {
  static async getAllProducts(filters = {}, pagination = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      vendorId,
      category,
    } = { ...filters, ...pagination };
    const query = {};
    const conditions = []; // Use $and to combine search and status conditions

    // Search condition
    if (search) {
      conditions.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      });
    }
    // Support both old isApproved and new status field
    if (status === "pending" || status === "pending_review") {
      conditions.push({
        $or: [
          { status: "pending_review" },
          { isApproved: false, status: { $exists: false } },
        ],
      });
    } else if (status === "approved") {
      conditions.push({
        $or: [
          { status: "approved" },
          { isApproved: true, status: { $exists: false } },
        ],
      });
    } else if (status === "rejected") {
      query.status = "rejected";
    }

    // Combine conditions with $and if there are multiple
    if (conditions.length > 0) {
      query.$and = conditions;
    }

    if (vendorId) query.vendorId = vendorId;

    // Handle category filtering - convert category ID to category name
    if (category) {
      try {
        // Check if it's a valid ObjectId (category ID)
        if (category.match(/^[0-9a-fA-F]{24}$/)) {
          const categoryDoc = await Category.findById(category);
          if (categoryDoc) {
            query.categories = categoryDoc.name;
          }
        } else {
          // If it's not an ObjectId, assume it's a category name
          query.categories = category;
        }
      } catch (err) {
        console.warn("Category filter error:", err);
        // If there's an error, try using it as a name directly
        query.categories = category;
      }
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("vendorId", "shopName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(query),
    ]);

    // Normalize status for frontend
    const normalizedProducts = products.map((p) => {
      const prod = p.toObject();
      // Ensure status field is set
      if (!prod.status) {
        prod.status = prod.isApproved ? "approved" : "pending_review";
      }
      return prod;
    });

    return {
      products: normalizedProducts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getPendingProducts(pagination = {}) {
    return this.getAllProducts({ status: "pending_review" }, pagination);
  }

  static async approveProduct(productId, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const previousValues = {
      isApproved: product.isApproved,
      status: product.status,
    };

    product.isApproved = true;
    product.status = "approved";
    product.approvedAt = new Date();
    product.approvedBy = adminId;
    product.rejectedAt = null;
    product.rejectedBy = null;
    product.rejectionReason = null;
    await product.save();

    // Clear all product caches to ensure approved product appears in listings
    if (isRedisAvailable()) {
      const keysToDelete = [
        "products:all",
        "products:all:approved",
        `products:${productId}`,
        `product:vendor:${product.vendorId}`,
      ];
      // Also clear paginated and category caches
      const patterns = [
        "products:approved:*",
        "products:skip:*",
        "products:category:*",
        "products:municipality:*",
      ];

      for (const key of keysToDelete) {
        const { safeDel } = require("../../../config/redis");
        await safeDel(key);
      }

      // Clear pattern-based keys
      for (const pattern of patterns) {
        try {
          const keys = await redisClient.keys(pattern);
          if (keys.length > 0) {
            const { safeDel } = require("../../../config/redis");
            await safeDel(keys);
          }
        } catch (err) {
          console.warn(
            `Failed to clear cache pattern ${pattern}:`,
            err.message,
          );
        }
      }
      console.log(
        `✅ Product caches cleared after approving product ${productId}`,
      );
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_APPROVED",
      "Product",
      productId,
      {
        previousValues,
        newValues: { isApproved: true, status: "approved" },
        notes: `Product "${product.name}" approved`,
      },
      req,
    );

    // Update product meta lists to include this product's categories/municipality
    try {
      await productMetaService.addProductMetadata(product);
    } catch (err) {
      console.error(
        "[ProductMeta] add after approve failed:",
        err.message || err,
      );
    }

    return product;
  }

  static async rejectProduct(productId, reason, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const previousValues = {
      isApproved: product.isApproved,
      status: product.status,
    };

    product.isApproved = false;
    product.status = "rejected";
    product.rejectedAt = new Date();
    product.rejectedBy = adminId;
    product.rejectionReason = reason;
    await product.save();

    // Clear caches to ensure rejected product is removed from public listings
    if (isRedisAvailable()) {
      const keysToDelete = [
        "products:all",
        "products:all:approved",
        `products:${productId}`,
        `product:vendor:${product.vendorId}`,
      ];
      const patterns = [
        "products:approved:*",
        "products:skip:*",
        "products:category:*",
        "products:municipality:*",
      ];

      for (const key of keysToDelete) {
        const { safeDel } = require("../../../config/redis");
        await safeDel(key);
      }

      for (const pattern of patterns) {
        try {
          const keys = await redisClient.keys(pattern);
          if (keys.length > 0) {
            const { safeDel } = require("../../../config/redis");
            await safeDel(keys);
          }
        } catch (err) {
          console.warn(
            `Failed to clear cache pattern ${pattern}:`,
            err.message,
          );
        }
      }
      console.log(
        `✅ Product caches cleared after rejecting product ${productId}`,
      );
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_REJECTED",
      "Product",
      productId,
      {
        previousValues,
        newValues: {
          isApproved: false,
          status: "rejected",
          rejectionReason: reason,
        },
        notes: reason,
      },
      req,
    );

    return product;
  }

  static async resetProductToPending(productId, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const previousValues = {
      isApproved: product.isApproved,
      status: product.status,
    };

    product.isApproved = false;
    product.status = "pending_review";
    product.approvedAt = null;
    product.approvedBy = null;
    product.rejectedAt = null;
    product.rejectedBy = null;
    product.rejectionReason = null;
    await product.save();

    // Clear caches to ensure product is removed from public listings
    if (isRedisAvailable()) {
      const keysToDelete = [
        "products:all",
        "products:all:approved",
        `products:${productId}`,
        `product:vendor:${product.vendorId}`,
      ];
      for (const key of keysToDelete) {
        const { safeDel } = require("../../../config/redis");
        await safeDel(key);
      }
      const patterns = [
        "products:approved:*",
        "products:skip:*",
        "products:category:*",
        "products:municipality:*",
      ];

      for (const pattern of patterns) {
        try {
          const keys = await redisClient.keys(pattern);
          if (keys.length > 0) {
            const { safeDel } = require("../../../config/redis");
            await safeDel(keys);
          }
        } catch (err) {
          console.warn(
            `Failed to clear cache pattern ${pattern}:`,
            err.message,
          );
        }
      }
      console.log(
        `✅ Product caches cleared after resetting product ${productId} to pending`,
      );
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_RESET_TO_PENDING",
      "Product",
      productId,
      {
        previousValues,
        newValues: { isApproved: false, status: "pending_review" },
        notes: `Product "${product.name}" reset to pending review`,
      },
      req,
    );

    return product;
  }

  static async disableProduct(productId, reason, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    product.isDisabled = true;
    product.disabledAt = new Date();
    product.disabledBy = adminId;
    product.disableReason = reason;
    await product.save();

    // Clear product cache
    if (isRedisAvailable()) {
      const CacheUtils = require("../../products/product-utils/cacheUtils");
      const cache = new CacheUtils(redisClient);
      await cache.deletePattern("products:*");
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_DISABLED",
      "Product",
      productId,
      {
        newValues: { isDisabled: true, reason },
        notes: reason,
      },
      req,
    );

    // If product was approved before disabling, remove its metadata so it doesn't appear in lists
    try {
      await productMetaService.removeProductMetadata(product);
    } catch (err) {
      console.error(
        "[ProductMeta] remove after disable failed:",
        err.message || err,
      );
    }

    return product;
  }

  static async enableProduct(productId, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    product.isDisabled = false;
    product.disabledAt = null;
    product.disabledBy = null;
    product.disableReason = null;
    await product.save();

    // Clear product cache
    if (isRedisAvailable()) {
      const CacheUtils = require("../../products/product-utils/cacheUtils");
      const cache = new CacheUtils(redisClient);
      await cache.deletePattern("products:*");
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_ENABLED",
      "Product",
      productId,
      {
        newValues: { isDisabled: false },
      },
      req,
    );

    // If product is approved and was re-enabled, re-add metadata
    try {
      if (product.isApproved || product.status === "approved") {
        await productMetaService.addProductMetadata(product);
      }
    } catch (err) {
      console.error(
        "[ProductMeta] add after enable failed:",
        err.message || err,
      );
    }

    return product;
  }

  static async deleteProduct(productId, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const productData = product.toObject();
    await Product.findByIdAndDelete(productId);

    // Clear product cache
    if (isRedisAvailable()) {
      const CacheUtils = require("../../products/product-utils/cacheUtils");
      const cache = new CacheUtils(redisClient);
      await cache.deletePattern("products:*");
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_DELETED",
      "Product",
      productId,
      {
        previousValues: productData,
        notes: `Product "${productData.name}" deleted`,
      },
      req,
    );

    // Remove metadata for deleted product if it was counted before
    try {
      await productMetaService.removeProductMetadata(productData);
    } catch (err) {
      console.error(
        "[ProductMeta] remove after delete failed:",
        err.message || err,
      );
    }

    return { success: true, deletedProduct: productData };
  }

  static async updateProduct(productId, updates, adminId, adminEmail, req) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const previousValues = product.toObject();
    Object.assign(product, updates);
    await product.save();

    // Clear product cache
    if (isRedisAvailable()) {
      const CacheUtils = require("../../products/product-utils/cacheUtils");
      const cache = new CacheUtils(redisClient);
      await cache.deletePattern("products:*");
    }

    await AuditService.log(
      adminId,
      adminEmail,
      "PRODUCT_EDITED",
      "Product",
      productId,
      {
        previousValues,
        newValues: updates,
      },
      req,
    );

    // Sync product meta for edits that may affect categories/municipality or approval state
    try {
      await productMetaService.handleProductUpdate(previousValues, product);
    } catch (err) {
      console.error(
        "[ProductMeta] handle update after admin edit failed:",
        err.message || err,
      );
    }

    return product;
  }
}

// ============================================
// ORDER & COMMISSION SERVICE
// ============================================
class OrderCommissionService {
  static async getAllOrders(filters = {}, pagination = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      vendorId,
      customerId,
      startDate,
      endDate,
    } = { ...filters, ...pagination };
    const query = {};

    if (status) query.status = status;
    if (vendorId) query.vendorId = vendorId;
    if (customerId) query.customerId = customerId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customerId", "name email")
        .populate("vendorId", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(query),
    ]);

    // Add commission calculation to each order
    const ordersWithCommission = orders.map((order) => ({
      ...order.toObject(),
      platformCommission:
        order.status === "delivered" ? (order.subTotal * 0.07).toFixed(2) : 0,
      sellerEarnings:
        order.status === "delivered" ? (order.subTotal * 0.93).toFixed(2) : 0,
    }));

    return {
      orders: ordersWithCommission,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getOrderDetails(orderId) {
    const order = await Order.findById(orderId)
      .populate("customerId", "name email phone address")
      .populate("vendorId", "name email");

    if (!order) throw new Error("Order not found");

    return {
      ...order.toObject(),
      platformCommission:
        order.status === "delivered" ? (order.subTotal * 0.07).toFixed(2) : 0,
      sellerEarnings:
        order.status === "delivered" ? (order.subTotal * 0.93).toFixed(2) : 0,
    };
  }

  static async updateOrderStatus(
    orderId,
    newStatus,
    adminId,
    adminEmail,
    notes,
    req,
  ) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const previousStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date();
    await order.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "ORDER_UPDATED",
      "Order",
      orderId,
      {
        previousValues: { status: previousStatus },
        newValues: { status: newStatus },
        notes,
      },
      req,
    );

    return order;
  }

  static async getCommissionReport(filters = {}) {
    const { startDate, endDate, vendorId } = filters;
    const query = { status: "delivered" };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (vendorId) query.vendorId = vendorId;

    const orders = await Order.find(query).populate("vendorId", "name email");

    const totalRevenue = orders.reduce((sum, o) => sum + (o.subTotal || 0), 0);
    const totalCommission = totalRevenue * 0.07;
    const totalSellerEarnings = totalRevenue * 0.93;

    // Group by vendor
    const vendorBreakdown = {};
    orders.forEach((order) => {
      const vendorKey = order.vendorId?._id?.toString() || "unknown";
      if (!vendorBreakdown[vendorKey]) {
        vendorBreakdown[vendorKey] = {
          vendor: order.vendorId,
          orderCount: 0,
          totalSales: 0,
          commission: 0,
          earnings: 0,
        };
      }
      vendorBreakdown[vendorKey].orderCount++;
      vendorBreakdown[vendorKey].totalSales += order.subTotal || 0;
      vendorBreakdown[vendorKey].commission += (order.subTotal || 0) * 0.07;
      vendorBreakdown[vendorKey].earnings += (order.subTotal || 0) * 0.93;
    });

    return {
      summary: {
        totalOrders: orders.length,
        totalRevenue,
        totalCommission,
        totalSellerEarnings,
      },
      vendorBreakdown: Object.values(vendorBreakdown),
    };
  }

  // Get pending COD commissions
  static async getPendingCODCommissions(filters = {}, pagination = {}) {
    const { page = 1, limit = 20, vendorId } = { ...filters, ...pagination };
    const query = {
      paymentMethod: "cod",
      status: "delivered",
      commissionStatus: "pending",
    };

    if (vendorId) query.vendorId = vendorId;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customerId", "name email")
        .populate("vendorId", "name email sellerApplication")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(query),
    ]);

    const ordersWithCommission = orders.map((order) => ({
      ...order.toObject(),
      commissionAmount:
        order.commissionAmount ||
        parseFloat((order.subTotal * 0.07).toFixed(2)),
      sellerEarnings:
        order.sellerEarnings || parseFloat((order.subTotal * 0.93).toFixed(2)),
    }));

    // Calculate totals
    const totalPendingCommission = ordersWithCommission.reduce(
      (sum, o) => sum + (o.commissionAmount || 0),
      0,
    );

    return {
      orders: ordersWithCommission,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalPendingCommission,
    };
  }

  // Collect COD commission
  static async collectCODCommission(orderId, adminId, adminEmail, notes, req) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.paymentMethod !== "cod") {
      throw new Error("This order is not a COD order");
    }

    if (order.status !== "delivered") {
      throw new Error("Order must be delivered before collecting commission");
    }

    if (order.commissionStatus === "paid") {
      throw new Error("Commission has already been collected for this order");
    }

    const previousStatus = order.commissionStatus;
    order.commissionStatus = "paid";
    order.commissionPaidAt = new Date();
    order.commissionCollectedBy = adminId;
    order.commissionNotes = notes;

    // Ensure commission is calculated
    if (!order.commissionAmount) {
      order.commissionAmount = parseFloat((order.subTotal * 0.07).toFixed(2));
      order.sellerEarnings = parseFloat((order.subTotal * 0.93).toFixed(2));
    }

    await order.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "COMMISSION_COLLECTED",
      "Order",
      orderId,
      {
        previousValues: { commissionStatus: previousStatus },
        newValues: {
          commissionStatus: "paid",
          commissionAmount: order.commissionAmount,
          notes,
        },
      },
      req,
    );

    return order;
  }

  // Waive commission (for special cases)
  static async waiveCommission(orderId, reason, adminId, adminEmail, req) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.commissionStatus === "paid") {
      throw new Error("Commission has already been paid");
    }

    const previousStatus = order.commissionStatus;
    order.commissionStatus = "waived";
    order.commissionNotes = `Waived: ${reason}`;
    await order.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "COMMISSION_WAIVED",
      "Order",
      orderId,
      {
        previousValues: { commissionStatus: previousStatus },
        newValues: { commissionStatus: "waived", reason },
      },
      req,
    );

    return order;
  }

  // Get commission summary
  static async getCommissionSummary() {
    const [
      totalPaidCommission,
      totalPendingCommission,
      totalWaivedCommission,
      codPendingCount,
      digitalPaidCount,
    ] = await Promise.all([
      Order.aggregate([
        { $match: { status: "delivered", commissionStatus: "paid" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ["$subTotal", 0.07] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: { status: "delivered", commissionStatus: "pending" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ["$subTotal", 0.07] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: { status: "delivered", commissionStatus: "waived" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ["$subTotal", 0.07] } },
          },
        },
      ]),
      Order.countDocuments({
        paymentMethod: "cod",
        status: "delivered",
        commissionStatus: "pending",
      }),
      Order.countDocuments({
        paymentMethod: { $ne: "cod" },
        status: "delivered",
        commissionStatus: "paid",
      }),
    ]);

    return {
      totalPaidCommission: totalPaidCommission[0]?.total || 0,
      totalPendingCommission: totalPendingCommission[0]?.total || 0,
      totalWaivedCommission: totalWaivedCommission[0]?.total || 0,
      codPendingCount,
      digitalPaidCount,
    };
  }
}

// ============================================
// ANALYTICS SERVICE
// ============================================
class AnalyticsService {
  static async getDashboardStats() {
    // Try cache first for performance
    const cacheKey = "adminDashboardStats";
    if (isRedisAvailable()) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log("📦 [CACHE HIT] Admin dashboard stats from cache");
          return JSON.parse(cached);
        }
      } catch (cacheErr) {
        console.warn("Cache read failed:", cacheErr.message);
      }
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalSellers,
      totalProducts,
      approvedProducts,
      totalOrders,
      pendingApplications,
      pendingProducts,
      todayOrders,
      weekOrders,
      monthOrders,
      completedOrders,
      pendingRefunds,
      recentOrdersData,
      recentUsersData,
      pendingCommissionOrders,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "vendor" }),
      Product.countDocuments(),
      Product.countDocuments({ status: "approved", isDisabled: { $ne: true } }),
      Order.countDocuments(),
      User.countDocuments({ "sellerApplication.status": "pending" }),
      Product.countDocuments({
        $or: [
          { status: "pending_review" },
          { isApproved: false, status: { $exists: false } },
        ],
      }),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.find({ status: "delivered" }).select("subTotal createdAt").lean(),
      RefundRequest
        ? RefundRequest.countDocuments({ status: "pending" }).catch(() => 0)
        : 0,
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("customerId", "name email")
        .select("orderId status totalAmount createdAt")
        .lean(),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email role createdAt")
        .lean(),
      Order.find({ status: { $in: ["pending", "processing", "shipped"] } })
        .select("subTotal")
        .lean(),
    ]);

    const totalRevenue = completedOrders.reduce(
      (sum, o) => sum + (o.subTotal || 0),
      0,
    );
    const todayRevenue = completedOrders
      .filter((o) => o.createdAt >= startOfToday)
      .reduce((sum, o) => sum + (o.subTotal || 0), 0);
    const weekRevenue = completedOrders
      .filter((o) => o.createdAt >= startOfWeek)
      .reduce((sum, o) => sum + (o.subTotal || 0), 0);
    const monthRevenue = completedOrders
      .filter((o) => o.createdAt >= startOfMonth)
      .reduce((sum, o) => sum + (o.subTotal || 0), 0);

    const platformCommission = totalRevenue * 0.07;
    const pendingRevenue = pendingCommissionOrders.reduce(
      (sum, o) => sum + (o.subTotal || 0),
      0,
    );
    const pendingCommission = pendingRevenue * 0.07;

    // Format recent orders for frontend
    const recentOrders = recentOrdersData.map((order) => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      totalAmount: order.totalAmount || order.subTotal,
      user: order.customerId
        ? { name: order.customerId.name, email: order.customerId.email }
        : null,
      createdAt: order.createdAt,
    }));

    // Format recent users for frontend
    const recentUsers = recentUsersData.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));

    const result = {
      users: { total: totalUsers, sellers: totalSellers },
      products: {
        total: totalProducts,
        approved: approvedProducts,
        pendingApproval: pendingProducts,
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        thisWeek: weekOrders,
        thisMonth: monthOrders,
        completed: completedOrders.length,
      },
      revenue: {
        total: totalRevenue,
        today: todayRevenue,
        thisWeek: weekRevenue,
        thisMonth: monthRevenue,
        platformCommission,
        pendingCommission,
      },
      pendingActions: {
        sellerApplications: pendingApplications,
        productApprovals: pendingProducts,
        refunds: pendingRefunds,
      },
      recentOrders,
      recentUsers,
    };

    // Cache the result for 2 minutes (shorter TTL for dashboard data freshness)
    if (isRedisAvailable()) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(result), { EX: 120 });
        console.log(
          "📦 [CACHE SET] Admin dashboard stats cached for 2 minutes",
        );
      } catch (cacheErr) {
        console.warn("Cache write failed:", cacheErr.message);
      }
    }

    return result;
  }

  static async getTopSellingProducts(limit = 10) {
    return Product.find({ isApproved: true })
      .sort({ sold: -1 })
      .limit(limit)
      .populate("vendorId", "shopName");
  }

  static async getTopSellers(limit = 10) {
    const vendors = await Vendor.find().populate("userId", "name email");

    const sellersWithStats = await Promise.all(
      vendors.map(async (vendor) => {
        const [productCount, completedOrders] = await Promise.all([
          Product.countDocuments({ vendorId: vendor._id }),
          Order.find({ vendorId: vendor._id, status: "delivered" }),
        ]);

        const totalRevenue = completedOrders.reduce(
          (sum, o) => sum + (o.subTotal || 0),
          0,
        );

        return {
          vendor,
          productCount,
          orderCount: completedOrders.length,
          totalRevenue,
        };
      }),
    );

    return sellersWithStats
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  static async getSalesChart(
    period = "monthly",
    year = new Date().getFullYear(),
  ) {
    const matchStage = {
      status: "delivered",
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      },
    };

    let groupStage;
    if (period === "daily") {
      groupStage = {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        revenue: { $sum: "$subTotal" },
      };
    } else if (period === "weekly") {
      groupStage = {
        _id: { $week: "$createdAt" },
        count: { $sum: 1 },
        revenue: { $sum: "$subTotal" },
      };
    } else {
      groupStage = {
        _id: { $month: "$createdAt" },
        count: { $sum: 1 },
        revenue: { $sum: "$subTotal" },
      };
    }

    const data = await Order.aggregate([
      { $match: matchStage },
      { $group: groupStage },
      { $sort: { _id: 1 } },
    ]);

    return data;
  }

  static async exportData(type, filters = {}) {
    let data;

    switch (type) {
      case "users":
        data = await User.find(filters).select("-password").lean();
        break;
      case "orders":
        data = await Order.find(filters)
          .populate("customerId", "name email")
          .populate("vendorId", "name email")
          .lean();
        break;
      case "products":
        data = await Product.find(filters)
          .populate("vendorId", "shopName")
          .lean();
        break;
      case "commission":
        const report =
          await OrderCommissionService.getCommissionReport(filters);
        data = report.vendorBreakdown;
        break;
      default:
        throw new Error("Invalid export type");
    }

    return data;
  }
}

// ============================================
// CATEGORY SERVICE
// ============================================
class CategoryService {
  static async getAllCategories(includeInactive = false) {
    const query = includeInactive ? {} : { isActive: true };
    return Category.find(query)
      .sort({ displayOrder: 1, name: 1 })
      .populate("parentCategory", "name slug");
  }

  static async createCategory(data, adminId, adminEmail, req) {
    const category = new Category({
      ...data,
      createdBy: adminId,
    });
    await category.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "CATEGORY_CREATED",
      "Category",
      category._id,
      {
        newValues: data,
      },
      req,
    );

    return category;
  }

  static async updateCategory(categoryId, updates, adminId, adminEmail, req) {
    const category = await Category.findById(categoryId);
    if (!category) throw new Error("Category not found");

    const previousValues = category.toObject();
    Object.assign(category, updates, { lastModifiedBy: adminId });
    await category.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "CATEGORY_UPDATED",
      "Category",
      categoryId,
      {
        previousValues,
        newValues: updates,
      },
      req,
    );

    return category;
  }

  static async deleteCategory(categoryId, adminId, adminEmail, req) {
    const category = await Category.findById(categoryId);
    if (!category) throw new Error("Category not found");

    // Check if category has products
    const productCount = await Product.countDocuments({
      categories: category.name,
    });
    if (productCount > 0) {
      throw new Error(
        `Cannot delete category with ${productCount} products. Reassign products first.`,
      );
    }

    const categoryData = category.toObject();
    await Category.findByIdAndDelete(categoryId);

    await AuditService.log(
      adminId,
      adminEmail,
      "CATEGORY_DELETED",
      "Category",
      categoryId,
      {
        previousValues: categoryData,
      },
      req,
    );

    return { success: true };
  }

  static async toggleCategoryStatus(categoryId, adminId, adminEmail, req) {
    const category = await Category.findById(categoryId);
    if (!category) throw new Error("Category not found");

    category.isActive = !category.isActive;
    category.lastModifiedBy = adminId;
    await category.save();

    await AuditService.log(
      adminId,
      adminEmail,
      category.isActive ? "CATEGORY_ENABLED" : "CATEGORY_DISABLED",
      "Category",
      categoryId,
      {
        newValues: { isActive: category.isActive },
      },
      req,
    );

    return category;
  }
}

// ============================================
// BANNER SERVICE
// ============================================
class BannerService {
  static async getAllBanners(filters = {}) {
    const query = {};
    if (filters.placement) query.placement = filters.placement;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;

    return Banner.find(query).sort({ displayOrder: 1, createdAt: -1 });
  }

  static async getActiveBanners(placement = "hero") {
    const now = new Date();
    return Banner.find({
      placement,
      isActive: true,
      $or: [
        { startDate: null, endDate: null },
        { startDate: { $lte: now }, endDate: { $gte: now } },
        { startDate: { $lte: now }, endDate: null },
        { startDate: null, endDate: { $gte: now } },
      ],
    }).sort({ displayOrder: 1 });
  }

  static async createBanner(data, adminId, adminEmail, req) {
    const banner = new Banner({
      ...data,
      createdBy: adminId,
    });
    await banner.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "BANNER_CREATED",
      "Banner",
      banner._id,
      {
        newValues: data,
      },
      req,
    );

    return banner;
  }

  static async updateBanner(bannerId, updates, adminId, adminEmail, req) {
    const banner = await Banner.findById(bannerId);
    if (!banner) throw new Error("Banner not found");

    const previousValues = banner.toObject();
    Object.assign(banner, updates, { lastModifiedBy: adminId });
    await banner.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "BANNER_UPDATED",
      "Banner",
      bannerId,
      {
        previousValues,
        newValues: updates,
      },
      req,
    );

    return banner;
  }

  static async deleteBanner(bannerId, adminId, adminEmail, req) {
    const banner = await Banner.findById(bannerId);
    if (!banner) throw new Error("Banner not found");

    const bannerData = banner.toObject();
    await Banner.findByIdAndDelete(bannerId);

    await AuditService.log(
      adminId,
      adminEmail,
      "BANNER_DELETED",
      "Banner",
      bannerId,
      {
        previousValues: bannerData,
      },
      req,
    );

    return { success: true };
  }

  static async toggleBannerStatus(bannerId, adminId, adminEmail, req) {
    const banner = await Banner.findById(bannerId);
    if (!banner) throw new Error("Banner not found");

    banner.isActive = !banner.isActive;
    banner.lastModifiedBy = adminId;
    await banner.save();

    await AuditService.log(
      adminId,
      adminEmail,
      banner.isActive ? "BANNER_ACTIVATED" : "BANNER_DEACTIVATED",
      "Banner",
      bannerId,
      {
        newValues: { isActive: banner.isActive },
      },
      req,
    );

    return banner;
  }

  static async recordBannerClick(bannerId) {
    await Banner.findByIdAndUpdate(bannerId, { $inc: { clickCount: 1 } });
  }

  static async recordBannerView(bannerId) {
    await Banner.findByIdAndUpdate(bannerId, { $inc: { viewCount: 1 } });
  }
}

// ============================================
// ANNOUNCEMENT SERVICE
// ============================================
class AnnouncementService {
  static async getAllAnnouncements(filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const query = {};

    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.type) query.type = filters.type;
    if (filters.targetAudience) query.targetAudience = filters.targetAudience;

    const [announcements, total] = await Promise.all([
      Announcement.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", "name email"),
      Announcement.countDocuments(query),
    ]);

    return {
      announcements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async createAnnouncement(data, adminId, adminEmail, req) {
    const announcement = new Announcement({
      ...data,
      createdBy: adminId,
    });
    await announcement.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "ANNOUNCEMENT_SENT",
      "Other",
      announcement._id,
      {
        newValues: { title: data.title, targetAudience: data.targetAudience },
      },
      req,
    );

    return announcement;
  }

  static async updateAnnouncement(announcementId, updates, adminId) {
    const announcement = await Announcement.findByIdAndUpdate(
      announcementId,
      updates,
      { new: true, runValidators: true },
    );
    if (!announcement) throw new Error("Announcement not found");
    return announcement;
  }

  static async deleteAnnouncement(announcementId) {
    const announcement = await Announcement.findByIdAndDelete(announcementId);
    if (!announcement) throw new Error("Announcement not found");
    return { success: true };
  }

  static async getActiveAnnouncements(userId, userRole) {
    const now = new Date();
    const query = {
      isActive: true,
      $or: [
        { targetAudience: "all" },
        { targetAudience: userRole === "vendor" ? "vendors" : "users" },
        { targetAudience: "specific", specificUserIds: userId },
      ],
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    };

    return Announcement.find(query).sort({ priority: -1, createdAt: -1 });
  }

  static async markAsRead(announcementId, userId) {
    await Announcement.findByIdAndUpdate(announcementId, {
      $addToSet: { readBy: { userId, readAt: new Date() } },
      $inc: { viewCount: 1 },
    });
  }
}

// ============================================
// REFUND SERVICE
// ============================================
class RefundService {
  static async getAllRefunds(filters = {}, pagination = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      vendorId,
      customerId,
    } = { ...filters, ...pagination };
    const query = {};

    if (status) query.status = status;
    if (vendorId) query.vendorId = vendorId;
    if (customerId) query.customerId = customerId;

    const [refunds, total] = await Promise.all([
      RefundRequest.find(query)
        .populate("orderId", "status subTotal createdAt")
        .populate("customerId", "name email")
        .populate("vendorId", "shopName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      RefundRequest.countDocuments(query),
    ]);

    return {
      refunds,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async approveRefund(refundId, adminId, adminEmail, notes = "", req) {
    const refund = await RefundRequest.findById(refundId);
    if (!refund) throw new Error("Refund request not found");

    // Only allow approve from these states
    if (!["pending", "under_review"].includes(refund.status)) {
      throw new Error("Refund request cannot be approved in current status");
    }

    // Validate refund amount
    if (
      refund.totalRefundAmount == null ||
      Number(refund.totalRefundAmount) <= 0
    ) {
      throw new Error("Invalid refund amount");
    }

    // Update order UI state (do NOT change order.status if you are unsure of enum values)
    const order = await Order.findById(refund.orderId);
    if (order) {
      order.refundStatus = "approved";
      order.refundNotes = notes || "Approved by admin";
      await order.save();

      // Invalidate caches so customers/vendors see updates immediately
      if (isRedisAvailable()) {
        const productKeys =
          order.items?.map((item) =>
            getProductOrdersKey(item.orderProductId || item.productId),
          ) || [];

        await safeDel([
          getOrderKey(order._id),
          getUserOrdersKey(order.customerId),
          getVendorOrdersKey(order.vendorId),
          ...productKeys,
        ]);
      }
    }

    refund.status = "approved";
    refund.reviewedBy = adminId;
    refund.reviewedAt = new Date();
    refund.reviewNotes = notes || "";

    refund.timeline.push({
      status: "approved",
      message: `Refund approved${notes ? `: ${notes}` : ""}`,
      updatedBy: adminId,
    });

    await refund.save();

    // Audit log (same pattern you used in rejectRefund)
    await AuditService.log(
      adminId,
      adminEmail,
      "REFUND_APPROVED",
      "Refund",
      refundId,
      {
        newValues: { status: "approved", notes },
        notes,
      },
      req,
    );

    return refund;
  }

  static async getRefundDetails(refundId) {
    const refund = await RefundRequest.findById(refundId)
      .populate("orderId")
      .populate("customerId", "name email phone")
      .populate("vendorId", "shopName");

    if (!refund) throw new Error("Refund request not found");
    return refund;
  }

  static async rejectRefund(refundId, reason, adminId, adminEmail, req) {
    const refund = await RefundRequest.findById(refundId);
    if (!refund) throw new Error("Refund request not found");
    if (refund.status !== "pending" && refund.status !== "under_review") {
      throw new Error("Refund request cannot be rejected in current status");
    }

    const order = await Order.findById(refund.orderId);
    if (order) {
      order.refundStatus = "rejected";
      order.refundNotes = reason;
      // Reset order status back to delivered since refund was rejected
      order.status = "delivered";
      await order.save();

      // Invalidate caches so customers see updated status immediately
      if (isRedisAvailable()) {
        const productKeys =
          order.items?.map((item) =>
            getProductOrdersKey(item.orderProductId || item.productId),
          ) || [];
        await safeDel([
          getOrderKey(order._id),
          getUserOrdersKey(order.customerId),
          getVendorOrdersKey(order.vendorId),
          ...productKeys,
        ]);
      }
    }

    refund.status = "rejected";
    refund.reviewedBy = adminId;
    refund.reviewedAt = new Date();
    refund.rejectionReason = reason;
    refund.timeline.push({
      status: "rejected",
      message: `Refund rejected: ${reason}`,
      updatedBy: adminId,
    });
    await refund.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "REFUND_REJECTED",
      "Refund",
      refundId,
      {
        newValues: { status: "rejected", reason },
        notes: reason,
      },
      req,
    );

    return refund;
  }

  static async processRefund(refundId, adminId) {
    const userWalletData = require("../../wallet/userWallet.model");
    const refund = await RefundRequest.findById(refundId);
    if (!refund) throw new Error("Refund request not found");
    if (refund.status !== "approved") {
      throw new Error("Only approved refunds can be processed");
    }

    // Process the actual refund (wallet credit, etc.)
    console.log("Customer id:", refund.customerId);
    const userWallet = await userWalletData.getOrCreateForUser(
      refund.customerId,
    );

    if (!userWallet) throw new Error("Customer wallet not found");

    if (refund.refundMethod !== "wallet")
      throw new Error(
        "Only wallet refunds are supported in this implementation",
      );

    userWallet.balance += refund.totalRefundAmount;
    await userWallet.save();

    // Update order so customer UI reflects processed state
    const order = await Order.findById(refund.orderId);
    if (order) {
      order.refundStatus = "processed";
      order.refundProcessedAt = new Date();
      await order.save();

      // Invalidate caches so customers see updated status immediately
      if (isRedisAvailable()) {
        const productKeys =
          order.items?.map((item) =>
            getProductOrdersKey(item.orderProductId || item.productId),
          ) || [];
        await safeDel([
          getOrderKey(order._id),
          getUserOrdersKey(order.customerId),
          getVendorOrdersKey(order.vendorId),
          ...productKeys,
        ]);
      }
    }

    refund.status = "processed";
    refund.processedAt = new Date();
    refund.timeline.push({
      status: "processed",
      message: `Refund of ₱${refund.totalRefundAmount} processed to customer ${refund.refundMethod}`,
      updatedBy: adminId,
    });
    await refund.save();

    return refund;
  }
}

// SYSTEM SETTINGS SERVICE
class SystemSettingsService {
  static async getSettings() {
    return SystemSettings.getSettings();
  }

  static async updateSettings(updates, adminId, adminEmail, req) {
    const previousSettings = await SystemSettings.getSettings();
    const newSettings = await SystemSettings.updateSettings(updates, adminId);

    await AuditService.log(
      adminId,
      adminEmail,
      "SETTINGS_UPDATED",
      "Settings",
      newSettings._id,
      {
        previousValues: previousSettings.toObject(),
        newValues: updates,
      },
      req,
    );

    return newSettings;
  }

  static async toggleMaintenanceMode(
    enabled,
    message,
    adminId,
    adminEmail,
    req,
  ) {
    const updates = {
      maintenanceMode: enabled,
      maintenanceMessage:
        message ||
        "We are currently under maintenance. Please check back later.",
    };

    const settings = await this.updateSettings(
      updates,
      adminId,
      adminEmail,
      req,
    );

    await AuditService.log(
      adminId,
      adminEmail,
      "MAINTENANCE_MODE_TOGGLED",
      "Settings",
      settings._id,
      {
        newValues: { maintenanceMode: enabled, message },
      },
      req,
    );

    return settings;
  }

  static async updateCommissionRate(rate, adminId, adminEmail, req) {
    if (rate < 0 || rate > 100) {
      throw new Error("Commission rate must be between 0 and 100");
    }

    const settings = await this.updateSettings(
      { commissionRate: rate },
      adminId,
      adminEmail,
      req,
    );

    await AuditService.log(
      adminId,
      adminEmail,
      "COMMISSION_RATE_CHANGED",
      "Settings",
      settings._id,
      {
        newValues: { commissionRate: rate },
      },
      req,
    );

    return settings;
  }
}

// ============================================
// MUNICIPALITY SERVICE
// ============================================
class MunicipalityService {
  static async getAllMunicipalities() {
    return await Municipality.find().sort({ name: 1 });
  }

  static async getActiveMunicipalities() {
    return await Municipality.find({ isActive: true }).sort({ name: 1 });
  }

  static async createMunicipality(data, adminId, adminEmail, req) {
    const municipality = new Municipality(data);
    await municipality.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "MUNICIPALITY_CREATED",
      "Municipality",
      municipality._id,
      {
        newValues: data,
      },
      req,
    );

    return municipality;
  }

  static async updateMunicipality(id, data, adminId, adminEmail, req) {
    const municipality = await Municipality.findById(id);
    if (!municipality) {
      throw new Error("Municipality not found");
    }

    const previousValues = {
      name: municipality.name,
      province: municipality.province,
      isActive: municipality.isActive,
    };

    Object.assign(municipality, data);
    await municipality.save();

    await AuditService.log(
      adminId,
      adminEmail,
      "MUNICIPALITY_UPDATED",
      "Municipality",
      id,
      {
        previousValues,
        newValues: data,
      },
      req,
    );

    return municipality;
  }

  static async deleteMunicipality(id, adminId, adminEmail, req) {
    const municipality = await Municipality.findById(id);
    if (!municipality) {
      throw new Error("Municipality not found");
    }

    await Municipality.findByIdAndDelete(id);

    await AuditService.log(
      adminId,
      adminEmail,
      "MUNICIPALITY_DELETED",
      "Municipality",
      id,
      {
        previousValues: {
          name: municipality.name,
          province: municipality.province,
        },
      },
      req,
    );

    return { message: "Municipality deleted successfully" };
  }
}

// Export all services
module.exports = {
  AuditService,
  UserManagementService,
  SellerManagementService,
  ProductManagementService,
  OrderCommissionService,
  AnalyticsService,
  CategoryService,
  BannerService,
  AnnouncementService,
  RefundService,
  SystemSettingsService,
  MunicipalityService,
};
