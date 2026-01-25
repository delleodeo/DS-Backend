const Vendor = require("./vendors.model");
const Order = require("../orders/orders.model");
const VendorWallet = require("../wallet/vendorWallet.model.js");
const { getBySellerId } = require("../subscription/subscription.service.js");
const { getRedisClient, isRedisAvailable } = require("../../config/redis");

const redisClient = getRedisClient();

const getVendorCacheKey = (vendorId) => `vendor:${vendorId}`;
const getVendorDetailsKey = (vendorId) => `vendor:details:${vendorId}`;
const COMMISSION_RATE = 0.07;

exports.createVendor = async (vendorData, vendorId) => {
  const isExist = await Vendor.findOne({ userId: vendorId });
  console.log(isExist);

  if (isExist) return { message: "You already created your shop!" };
  const vendor = new Vendor(vendorData);
  const saved = await vendor.save();
  if (isRedisAvailable()) {
    await redisClient.set(
      getVendorCacheKey(saved.userId),
      JSON.stringify(saved),
      { EX: 300 },
    );
  }
  return saved;
};

exports.followVendor = async (vendorId, userId) => {
  try {
    if (isRedisAvailable()) {
      const { safeDel } = require("../../config/redis");
      await safeDel(`vendor:details:${vendorId}`);
    }

    let vendor = await Vendor.findById(vendorId);
    if (!vendor) vendor = await Vendor.findOne({ userId: vendorId });
    if (!vendor) throw new Error("Vendor not found");
    if (String(vendor.userId) === String(userId))
      throw new Error("You cannot follow your own shop");

    const userIdStr = String(userId);
    const isFollowing = vendor.followers.map(String).includes(userIdStr);

    if (isFollowing) {
      vendor.followers = vendor.followers.filter(
        (id) => String(id) !== userIdStr,
      );
      await vendor.save();
      return {
        message: "Unfollowed successfully",
        totalFollowers: vendor.followers.length,
      };
    }

    vendor.followers.push(userIdStr);
    await vendor.save();

    return {
      message: "Followed successfully",
      totalFollowers: vendor.followers.length,
    };
  } catch (error) {
    console.error("Follow Vendor Error:", error);
    throw new Error("Failed to follow/unfollow vendor");
  }
};

exports.getFeaturedVendor = async () => {
  try {
    const featuredVendorKey = "vendor:featured";
    if (isRedisAvailable()) {
      const cached = await redisClient.get(featuredVendorKey);
      if (cached) return JSON.parse(cached);
    }

    const featuredVendor = await Vendor.find()
      .select("storeName userId imageUrl")
      .lean();
    const paginated = featuredVendor.slice(0, 10);

    const filteredData = paginated.map((data) => ({
      storeName: data.storeName,
      userId: data.userId,
      imageUrl: data.imageUrl,
    }));

    if (filteredData.length > 0 && isRedisAvailable()) {
      await redisClient.set(featuredVendorKey, JSON.stringify(filteredData), {
        EX: 300,
      });
    }

    return filteredData;
  } catch (error) {
    console.error("Get Featured Vendor Error:", error);
    const featuredVendor = await Vendor.find()
      .select("storeName userId imageUrl")
      .lean();
    const paginated = featuredVendor.slice(0, 10);
    return paginated.map((data) => ({
      storeName: data.storeName,
      userId: data.userId,
      imageUrl: data.imageUrl,
    }));
  }
};

exports.getFeaturedSubscribedVendors = async () => {
  try {
    const cacheKey = "vendor:featured:subscribed";
    if (isRedisAvailable()) {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    // Get active subscribed seller IDs
    const { Subscription } = require("../subscription/models/Subscription");
    const activeSubscriptions = await Subscription.find({ status: 'active' }, { sellerId: 1 });
    const sellerIds = activeSubscriptions.map(sub => sub.sellerId);

    // if (sellerIds.length === 0) {
    //   // Fallback to regular featured vendors
    //   return await exports.getFeaturedVendor();
    // }

    // Get vendor details for subscribed sellers
    const subscribedVendors = await Vendor.aggregate([{ $match: { userId: { $in: sellerIds } } }])
    .project({ storeName: 1, userId: 1, imageUrl: 1 })
    const filteredData = subscribedVendors.map((data) => ({
      storeName: data.storeName,
      userId: data.userId,
      imageUrl: data.imageUrl,
    }));

    if (filteredData.length > 0 && isRedisAvailable()) {
      await redisClient.set(cacheKey, JSON.stringify(filteredData), {
        EX: 300, // 5 minutes
      });
    }

    return filteredData;
  } catch (error) {
    console.error("Get Featured Subscribed Vendors Error:", error);
    // Fallback to regular featured vendors
    return await exports.getFeaturedVendor();
  }
};

exports.getVendorDetails = async (vendorId, userId) => {
  try {
    if (isRedisAvailable()) {
      const cached = await redisClient.get(getVendorDetailsKey(vendorId));
      if (cached) return JSON.parse(cached);
    }

    const vendor = await Vendor.findOne({ userId: vendorId })
      .select(
        "address storeName followers rating numRatings userId totalProducts totalOrders totalRevenue imageUrl description phoneNumber createdAt",
      )
      .populate("followers", "name email _id");

    if (!vendor) throw new Error("Vendor not found");

    const {
      trackVendorView,
    } = require("../vendors/subcriptors/subscriptor.sevice.js");

    await trackVendorView({ vendorUserId: vendorId, visitorId: userId || null });

    const Product = require("../products/products.model");
    const approvedProductCount = await Product.countDocuments({
      vendor: vendorId,
      status: "approved",
      isDisabled: { $ne: true },
    });

    const Order = require("../orders/orders.model");
    const completedOrders = await Order.countDocuments({
      vendor: vendorId,
      status: { $in: ["completed", "delivered"] },
    });

    const Review = require("../reviews/review.model");
    const totalReviews = await Review.countDocuments({ vendor: vendorId });

    const vendorData = vendor.toObject();
    vendorData.approvedProducts = approvedProductCount;
    vendorData.totalSales = completedOrders;
    vendorData.totalReviews = totalReviews;
    vendorData.responseRate = 95;
    vendorData.responseTime = "Within 1 hour";
    vendorData.isVerified = vendor.isApproved !== false;

    if (isRedisAvailable()) {
      await redisClient.set(
        getVendorDetailsKey(vendorId),
        JSON.stringify(vendorData),
        { EX: 300 },
      );
    }

    return vendorData;
  } catch (error) {
    console.error("getVendorDetails error:", error);
    const vendor = await Vendor.findOne({ userId: vendorId })
      .select(
        "address storeName followers rating numRatings userId totalProducts totalOrders totalRevenue imageUrl description phoneNumber createdAt",
      )
      .populate("followers", "name email _id");
    return vendor;
  }
};

exports.getVendorById = async (vendorId) => {
  const cacheKey = getVendorCacheKey(vendorId);
  try {
    if (isRedisAvailable()) {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const vendor = await Vendor.findOne({ userId: vendorId }).populate(
      "followers",
      "name email",
    );
    if (!vendor) throw new Error("Vendor not found");

    const wallet = await VendorWallet.getOrCreateForUser(vendorId);
    const calculatedStats = await exports.calculateVendorStats(vendorId);

    const vendorData = vendor.toObject();
    vendorData.wallet = wallet?.balance || 0;
    vendorData.totalOrders = calculatedStats.totalOrders;
    vendorData.totalRevenue = calculatedStats.totalRevenue;
    vendorData.currentMonthlyRevenue = calculatedStats.currentMonthlyRevenue;
    vendorData.monthlyRevenueComparison =
      calculatedStats.monthlyRevenueComparison;

    if (isRedisAvailable()) {
      await redisClient.set(cacheKey, JSON.stringify(vendorData), { EX: 300 });
    }

    console.log("Vendor:", vendorData.monthlyRevenueComparison);
    return vendorData;
  } catch (error) {
    throw new Error("Failed to fetch vendor data");
  }
};

exports.calculateVendorStats = async (vendorId) => {
  try {
    const MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const orders = await Order.find({
      vendorId: vendorId,
      status: { $in: ["delivered", "completed"] },
    })
      .select("subTotal createdAt")
      .lean();

    const monthlyMap = new Map();
    let totalRevenue = 0;

    for (const order of orders) {
      const gross = order.subTotal || 0;
      totalRevenue += gross;

      const d = new Date(order.createdAt);
      const year = d.getFullYear();
      const monthName = MONTH_NAMES[d.getMonth()];
      const key = `${year}:${monthName}`;

      if (!monthlyMap.has(key))
        monthlyMap.set(key, { year, monthName, total: 0 });
      monthlyMap.get(key).total += gross;
    }

    const groupedByYear = {};
    for (const { year, monthName, total } of monthlyMap.values()) {
      if (!groupedByYear[year]) {
        groupedByYear[year] = {
          year,
          revenues: {
            January: 0,
            February: 0,
            March: 0,
            April: 0,
            May: 0,
            June: 0,
            July: 0,
            August: 0,
            September: 0,
            October: 0,
            November: 0,
            December: 0,
          },
        };
      }
      groupedByYear[year].revenues[monthName] += total;
    }

    const monthlyRevenueComparison = Object.values(groupedByYear);

    const now = new Date();
    const currentMonthName = MONTH_NAMES[now.getMonth()];
    const currentYear = now.getFullYear();

    const currentMonthRevenue =
      monthlyRevenueComparison.find((c) => c.year === currentYear)?.revenues[
        currentMonthName
      ] || 0;

    return {
      totalOrders: orders.length,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      currentMonthlyRevenue: parseFloat(currentMonthRevenue.toFixed(2)),
      monthlyRevenueComparison,
    };
  } catch (error) {
    console.error("Calculate Vendor Stats Error:", error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      currentMonthlyRevenue: 0,
      monthlyRevenueComparison: [],
    };
  }
};

exports.updateVendor = async (id, updates) => {
  const updated = await Vendor.findOneAndUpdate({ userId: id }, updates, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new Error("Vendor not found or update failed");

  if (isRedisAvailable()) {
    await redisClient.set(getVendorCacheKey(id), JSON.stringify(updated), {
      EX: 3600,
    });
  }
  return updated;
};

exports.deleteVendor = async (id) => {
  const deleted = await Vendor.findByIdAndDelete(id);
  if (!deleted) throw new Error("Vendor not found or already deleted");

  if (isRedisAvailable()) {
    const { safeDel } = require("../../config/redis");
    await safeDel(getVendorCacheKey(id));
  }
};

exports.incrementProfileViews = async (userId) => {
  const vendor = await Vendor.findOneAndUpdate(
    { userId },
    { $inc: { profileViews: 1 } },
    { new: true },
  );
  if (vendor && isRedisAvailable()) {
    await redisClient.set(getVendorCacheKey(userId), JSON.stringify(vendor), {
      EX: 3600,
    });
  }
};

exports.incrementProductClicks = async (userId) => {
  const vendor = await Vendor.findOneAndUpdate(
    { userId },
    { $inc: { productClicks: 1 } },
    { new: true },
  );
  if (vendor && isRedisAvailable()) {
    await redisClient.set(getVendorCacheKey(userId), JSON.stringify(vendor), {
      EX: 3600,
    });
  }
};

exports.pushMonthlyRevenue = async (
  userId,
  revenueAmount,
  year = null,
  month = null,
) => {
  try {
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const targetMonth = month || monthNames[currentDate.getMonth()];

    const vendor = await Vendor.findOne({ userId });
    if (!vendor) throw new Error("Vendor not found");

    const yearIndex = vendor.monthlyRevenueComparison.findIndex(
      (data) => data.year === targetYear,
    );

    if (yearIndex !== -1) {
      vendor.monthlyRevenueComparison[yearIndex].revenues[targetMonth] =
        revenueAmount;
    } else {
      vendor.monthlyRevenueComparison.push({
        year: targetYear,
        revenues: {
          January: 0,
          February: 0,
          March: 0,
          April: 0,
          May: 0,
          June: 0,
          July: 0,
          August: 0,
          September: 0,
          October: 0,
          November: 0,
          December: 0,
          [targetMonth]: revenueAmount,
        },
      });
    }

    await vendor.save();

    const { safeDel } = require("../../config/redis");
    await safeDel(getVendorCacheKey(userId));

    return {
      success: true,
      message: `Revenue for ${targetMonth} ${targetYear} updated successfully`,
      data: vendor.monthlyRevenueComparison,
    };
  } catch (error) {
    console.error("Push Monthly Revenue Error:", error);
    throw error;
  }
};

exports.resetCurrentMonthRevenue = async (userId) => {
  try {
    const vendor = await Vendor.findOne({ userId });
    if (!vendor) throw new Error("Vendor not found");

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const currentMonth = monthNames[currentDate.getMonth()];

    vendor.currentMonthlyRevenue = 0;
    await vendor.save();

    const { safeDel } = require("../../config/redis");
    await safeDel(getVendorCacheKey(userId));

    return {
      success: true,
      message: `Current monthly revenue reset for ${currentMonth} ${currentYear}`,
      data: vendor.monthlyRevenueComparison,
    };
  } catch (error) {
    console.error("Reset Current Month Revenue Error:", error);
    throw error;
  }
};

exports.batchResetMonthlyRevenue = async () => {
  try {
    const vendors = await Vendor.find({});
    const results = { success: [], failed: [] };

    for (const vendor of vendors) {
      try {
        await exports.resetCurrentMonthRevenue(vendor.userId);
        results.success.push(vendor.userId);
      } catch (error) {
        console.error(
          `Failed to reset revenue for vendor ${vendor.userId}:`,
          error,
        );
        results.failed.push({ userId: vendor.userId, error: error.message });
      }
    }

    return {
      success: true,
      message: "Batch monthly revenue reset completed",
      totalVendors: vendors.length,
      successCount: results.success.length,
      failedCount: results.failed.length,
      details: results,
    };
  } catch (error) {
    console.error("Batch Reset Monthly Revenue Error:", error);
    throw error;
  }
};

exports.getVendorFinancials = async (
  vendorId,
  { page = 1, limit = 12 } = {},
) => {
  try {
    const vendor =
      (await Vendor.findOne({ userId: vendorId })) ||
      (await Vendor.findById(vendorId));
    const effectiveCommissionRate = vendor?.commissionRate ?? COMMISSION_RATE;

    const baseFilter = {
      vendorId: vendorId,
      status: { $in: ["delivered", "completed"] },
    };

    const orders = await Order.find(baseFilter).sort({ createdAt: -1 }).lean();

    let totalGrossRevenue = 0;
    let totalCommissionPaid = 0;
    let totalCommissionPending = 0;
    let totalNetEarnings = 0;
    let codPendingCommission = 0;
    let digitalPaymentCommission = 0;
    let pendingAdminRelease = 0;
    let netReleased = 0;
    let netExpected = 0;

    for (const order of orders) {
      const grossAmount = order.subTotal || 0;
      const orderCommissionRate =
        order.commissionRate ?? effectiveCommissionRate;
      const commissionAmount =
        order.commissionAmount ||
        parseFloat((grossAmount * orderCommissionRate).toFixed(2));
      const netEarnings =
        order.sellerEarnings ||
        parseFloat((grossAmount - commissionAmount).toFixed(2));
      const payoutStatus = order.payoutStatus || "not_applicable";
      const escrowStatus = order.escrowStatus || "not_applicable";
      const paymentMethod = order.paymentMethod || "COD";
      const isCod = String(paymentMethod).toLowerCase() === "cod";

      totalGrossRevenue += grossAmount;
      netExpected += netEarnings;

      const commissionStatus = order.commissionStatus || "pending";

      if (commissionStatus === "paid" || commissionStatus === "waived") {
        totalCommissionPaid += commissionAmount;
        totalNetEarnings += netEarnings;
        if (paymentMethod !== "COD")
          digitalPaymentCommission += commissionAmount;
      } else {
        totalCommissionPending += commissionAmount;
        totalNetEarnings += netEarnings;
        if (paymentMethod === "COD") codPendingCommission += commissionAmount;
      }

      if (!isCod) {
        if (payoutStatus === "released" || escrowStatus === "released")
          netReleased += netEarnings;
        else pendingAdminRelease += netEarnings;
      } else {
        if (commissionStatus !== "pending") netReleased += netEarnings;
      }
    }

    const currentYear = new Date().getFullYear();
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthlyBreakdown = {};
    months.forEach((month) => {
      monthlyBreakdown[month] = {
        grossRevenue: 0,
        commissionPaid: 0,
        commissionPending: 0,
        netEarnings: 0,
        orderCount: 0,
      };
    });

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      if (orderDate.getFullYear() !== currentYear) return;

      const monthName = months[orderDate.getMonth()];
      const grossAmount = order.subTotal || 0;
      const orderCommissionRate =
        order.commissionRate ?? effectiveCommissionRate;
      const commissionAmount =
        order.commissionAmount ||
        parseFloat((grossAmount * orderCommissionRate).toFixed(2));
      const commissionStatus = order.commissionStatus || "pending";

      monthlyBreakdown[monthName].grossRevenue += grossAmount;
      monthlyBreakdown[monthName].orderCount += 1;

      if (commissionStatus === "paid" || commissionStatus === "waived") {
        monthlyBreakdown[monthName].commissionPaid += commissionAmount;
        monthlyBreakdown[monthName].netEarnings +=
          grossAmount - commissionAmount;
      } else {
        monthlyBreakdown[monthName].commissionPending += commissionAmount;
        monthlyBreakdown[monthName].netEarnings +=
          grossAmount - commissionAmount;
      }
    });

    const totalRecentOrders = await Order.countDocuments(baseFilter);
    const pageNum = Math.max(1, Number(page) || 1);
    const pageLimit = Math.max(1, Math.min(12, Number(limit) || 12));

    const recentOrdersQuery = await Order.find(baseFilter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageLimit)
      .limit(pageLimit)
      .lean();

    const recentOrders = recentOrdersQuery.map((order) => {
      const grossAmount = order.subTotal || 0;
      const orderCommissionRate =
        order.commissionRate ?? effectiveCommissionRate;
      const commissionAmount =
        order.commissionAmount ||
        parseFloat((grossAmount * orderCommissionRate).toFixed(2));
      const netEarnings =
        order.sellerEarnings ||
        parseFloat((grossAmount - commissionAmount).toFixed(2));

      return {
        orderId: order._id,
        orderNumber:
          order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
        date: order.createdAt,
        status: order.status,
        paymentMethod: order.paymentMethod || "COD",
        paymentStatus: order.paymentStatus || "pending",
        grossAmount,
        commissionAmount,
        commissionStatus: order.commissionStatus || "pending",
        netEarnings,
        payoutStatus: order.payoutStatus || "not_applicable",
        buyerName: order.shippingAddress?.fullName || "N/A",
      };
    });

    return {
      success: true,
      summary: {
        totalGrossRevenue: parseFloat(totalGrossRevenue.toFixed(2)),
        totalCommissionPaid: parseFloat(totalCommissionPaid.toFixed(2)),
        totalCommissionPending: parseFloat(totalCommissionPending.toFixed(2)),
        totalNetEarnings: parseFloat(totalNetEarnings.toFixed(2)),
        netEarningsReleased: parseFloat(netReleased.toFixed(2)),
        pendingAdminRelease: parseFloat(pendingAdminRelease.toFixed(2)),
        netEarningsExpected: parseFloat(netExpected.toFixed(2)),
        codPendingCommission: parseFloat(codPendingCommission.toFixed(2)),
        digitalPaymentCommission: parseFloat(
          digitalPaymentCommission.toFixed(2),
        ),
        commissionRate: (effectiveCommissionRate || COMMISSION_RATE) * 100,
        totalOrders: totalRecentOrders,
      },
      monthlyBreakdown,
      recentOrders: {
        data: recentOrders,
        page: pageNum,
        limit: pageLimit,
        total: totalRecentOrders,
      },
    };
  } catch (error) {
    console.error("Get Vendor Financials Error:", error);
    throw error;
  }
};

exports.getVendorPendingCODCommissions = async (vendorId) => {
  try {
    const vendorIdStr = vendorId.toString();
    const commissionService = require("../commissions/commission.service");

    const result = await commissionService.getPendingCommissions(vendorIdStr, {
      page: 1,
      limit: 100,
      status: "pending",
    });

    if (!result || !result.commissions) {
      return {
        success: true,
        totalPendingCommission: 0,
        pendingOrdersCount: 0,
        orders: [],
      };
    }

    const orders = result.commissions.map((commission) => ({
      commissionId: commission._id,
      orderId: commission.order._id,
      orderNumber:
        commission.metadata?.orderNumber ||
        commission.order.orderNumber ||
        commission.order._id.toString().slice(-8).toUpperCase(),
      deliveredDate: commission.metadata?.deliveredAt || new Date(),
      grossAmount: commission.orderAmount,
      commissionDue: commission.commissionAmount,
      commissionRate: commission.commissionRate,
      dueDate: commission.dueDate,
      buyerName: commission.metadata?.customerName || "N/A",
      buyerPhone: "N/A",
    }));

    const totalPending = orders.reduce((sum, o) => sum + o.commissionDue, 0);

    return {
      success: true,
      totalPendingCommission: parseFloat(totalPending.toFixed(2)),
      pendingOrdersCount: orders.length,
      orders,
    };
  } catch (error) {
    console.error("Get Vendor Pending COD Commissions Error:", error);
    throw error;
  }
};
