/**
 * COD Commission Service
 * Handles all business logic for commission management with security measures
 */
const mongoose = require("mongoose");
const Commission = require("./commission.model");
const Wallet = require("../wallet/userWallet.model");
const WalletTransaction = require("../wallet/walletTransaction.model");
 const VendorWallet = require("../wallet/vendorWallet.model.js");
const Order = require("../orders/orders.model");
const Vendor = require("../vendors/vendors.model");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
} = require("../../utils/errorHandler");
const { getAsync, setAsync, delAsync, safeDel } = require("../../config/redis");
const crypto = require("crypto");
const { getRedisClient, isRedisAvailable } = require("../../config/redis");

// Circuit breaker state
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  isOpen: false,
  threshold: 5,
  resetTimeout: 60000, // 1 minute
};

/**
 * Check circuit breaker state
 */
const checkCircuitBreaker = () => {
  if (!circuitBreaker.isOpen) return true;

  const now = Date.now();
  if (now - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    return true;
  }

  return false;
};

/**
 * Record circuit breaker failure
 */
const recordFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true;
    console.error(
      "[Commission Service] Circuit breaker opened due to repeated failures",
    );
  }
};

const generateIdempotencyKey = (commissionId, vendorId) => {
  // Deterministic per commission/vendor to block concurrent duplicates
  const data = `${commissionId}:${vendorId}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

const isValidObjectId = (id) => {
  return mongoose.isValidObjectId(id);
};

const sanitizeString = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/[<>\"\'&]/g, "")
    .trim()
    .substring(0, 1000);
};

const createCODCommission = async (orderData, vendorId, shopId) => {
  try {
    if (!checkCircuitBreaker()) {
      throw new ExternalServiceError(
        "Commission Service",
        "Service temporarily unavailable",
      );
    }

    if (!isValidObjectId(orderData.orderId)) {
      throw new ValidationError("Invalid order ID");
    }
    if (!isValidObjectId(vendorId)) {
      throw new ValidationError("Invalid vendor ID");
    }
    if (!isValidObjectId(shopId)) {
      throw new ValidationError("Invalid shop ID");
    }

    // Convert to ObjectId for consistent storage
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const shopObjectId = new mongoose.Types.ObjectId(shopId);
    const orderObjectId = new mongoose.Types.ObjectId(orderData.orderId);

    // Check for existing commission to prevent duplicates
    const existingCommission = await Commission.findOne({
      order: orderObjectId,
      vendor: vendorObjectId,
    });

    if (existingCommission) {
      console.log(
        `[Commission] Commission already exists for order ${orderData.orderId}`,
      );
      return existingCommission;
    }

    // Get commission rate from system settings or use default
    const commissionRate = orderData.commissionRate || 5; // 5% default
    const commissionAmount = (orderData.amount * commissionRate) / 100;

    // Calculate due date (7 days from delivery or order creation)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const commission = new Commission({
      order: orderObjectId,
      vendor: vendorObjectId,
      shop: shopObjectId,
      orderAmount: orderData.amount,
      commissionRate: commissionRate,
      commissionAmount: Math.round(commissionAmount * 100) / 100, // Round to 2 decimals
      paymentMethod: "cod",
      dueDate: dueDate,
      metadata: {
        orderNumber: sanitizeString(orderData.orderNumber),
        customerName: sanitizeString(orderData.customerName),
        deliveredAt: orderData.deliveredAt || null,
      },
      statusHistory: [
        {
          status: "pending",
          changedAt: new Date(),
          reason: "Commission created for COD order",
        },
      ],
    });

    await commission.save();

    // Invalidate related caches
    await invalidateCommissionCache(vendorId);

    console.log(
      `[Commission] Created commission ${commission._id} for order ${orderData.orderId}, amount: ${commissionAmount}`,
    );

    return commission;
  } catch (error) {
    recordFailure();
    console.error("[Commission] Error creating COD commission:", error);
    throw error;
  }
};

/**
 * Get pending commissions for a vendor with caching
 */
const getPendingCommissions = async (vendorId, options = {}) => {
  try {
    if (!isValidObjectId(vendorId)) {
      throw new ValidationError("Invalid vendor ID");
    }

    // Convert to ObjectId for consistent MongoDB comparison
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const cacheKey = `commissions:pending:${vendorId}`;

    // Try cache first
    if (!options.skipCache) {
      const cached = await getAsync(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    const query = {
      vendor: vendorObjectId,
    };

    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ["pending", "overdue"] };
    }

    console.log(
      "[Commission] Query for pending commissions:",
      JSON.stringify(query),
    );

    const [commissions, total] = await Promise.all([
      Commission.find(query)
        .populate("order", "orderNumber totalAmount status deliveredAt")
        .populate("shop", "shopName")
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Commission.countDocuments(query),
    ]);

    console.log(
      `[Commission] Found ${commissions.length} commissions for vendor ${vendorId}`,
    );

    const result = {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };

    // Cache for 5 minutes
    await setAsync(cacheKey, JSON.stringify(result), "EX", 300);

    return result;
  } catch (error) {
    console.error("[Commission] Error getting pending commissions:", error);
    throw error;
  }
};

/**
 * Get commission summary for vendor dashboard
 */
const getCommissionSummary = async (vendorId) => {
  try {
    if (!isValidObjectId(vendorId)) {
      throw new ValidationError("Invalid vendor ID");
    }

    const cacheKey = `commissions:summary:${vendorId}`;

    const cached = await getAsync(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [pendingStats, remittedStats, overdueStats] = await Promise.all([
      Commission.aggregate([
        {
          $match: {
            vendor: new mongoose.Types.ObjectId(vendorId),
            status: "pending",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$commissionAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Commission.aggregate([
        {
          $match: {
            vendor: new mongoose.Types.ObjectId(vendorId),
            status: "remitted",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$commissionAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Commission.aggregate([
        {
          $match: {
            vendor: new mongoose.Types.ObjectId(vendorId),
            status: "overdue",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$commissionAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      pending: {
        amount: pendingStats[0]?.total || 0,
        count: pendingStats[0]?.count || 0,
      },
      remitted: {
        amount: remittedStats[0]?.total || 0,
        count: remittedStats[0]?.count || 0,
      },
      overdue: {
        amount: overdueStats[0]?.total || 0,
        count: overdueStats[0]?.count || 0,
      },
      totalPendingAmount:
        (pendingStats[0]?.total || 0) + (overdueStats[0]?.total || 0),
    };

    // Cache for 5 minutes
    await setAsync(cacheKey, JSON.stringify(summary), "EX", 300);

    return summary;
  } catch (error) {
    console.error("[Commission] Error getting commission summary:", error);
    throw error;
  }
};



/**
 * Get remittance history for a vendor
 */
const getRemittanceHistory = async (vendorId, options = {}) => {
  try {
    if (!isValidObjectId(vendorId)) {
      throw new ValidationError("Invalid vendor ID");
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    // Find all remitted commissions with remittance history
    const [commissions, total] = await Promise.all([
      Commission.find({
        vendor: vendorObjectId,
        status: "remitted",
      })
        .select(
          "order commissionAmount remittanceHistory remittedAt remittanceMethod",
        )
        .populate("order", "orderNumber")
        .sort({ remittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Commission.countDocuments({
        vendor: vendorObjectId,
        status: "remitted",
      }),
    ]);

    // Flatten remittance history
    const history = commissions
      .flatMap((commission) =>
        (commission.remittanceHistory || []).map((entry) => ({
          _id: commission._id,
          orderNumber: commission.order?.orderNumber || "N/A",
          commissionAmount: commission.commissionAmount,
          remittedAt: entry.remittedAt,
          amount: entry.amount,
          method: entry.method,
          referenceNumber: entry.referenceNumber,
          walletTransactionId: entry.walletTransactionId,
          status: entry.status,
          notes: entry.notes,
        })),
      )
      .sort((a, b) => new Date(b.remittedAt) - new Date(a.remittedAt));

    const totalAmount = history.reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );

    return {
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalRemitted: history.length,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
      },
    };
  } catch (error) {
    console.error("[Commission] Error getting remittance history:", error);
    throw error;
  }
};

const bulkRemitCommissions = async (commissionIds, vendorId, userId) => {
  const results = {
    successful: [],
    failed: [],
    totalAmount: 0,
    timestamp: new Date(),
  };

  // Process sequentially to maintain transaction integrity
  for (const commissionId of commissionIds) {
    try {
      const result = await remitCommissionViaWallet(
        commissionId,
        vendorId,
        userId,
      );
      results.successful.push({
        commissionId,
        amount: result.commission.commissionAmount,
        remittedAt: result.commission.remittedAt,
      });
      results.totalAmount += result.commission.commissionAmount;
    } catch (error) {
      results.failed.push({
        commissionId,
        error: error.message,
      });
    }
  }

  // Invalidate cache after bulk remittance
  if (results.successful.length > 0 && vendorId) {
    if (isRedisAvailable()) {
      await safeDel(`vendor:${vendorId}`);
    }
  }

  return results;
};

/**
 * Verify wallet balance integrity
 */



const MONEY_EPSILON = 0.01;

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string" && mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(value);
  return null;
};

const toMoneyNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
};

// const verifyWalletBalance = async (walletId, session) => {
//   const walletObjectId = toObjectId(walletId);
//   if (!walletObjectId) return { stored: 0, calculated: 0 };

//   const wallet = await VendorWallet.findById(walletObjectId).session(session);
//   if (!wallet) return { stored: 0, calculated: 0 };

//   const [sum] = await WalletTransaction.aggregate([
//     { $match: { wallet: walletObjectId, status: "completed" } },
//     {
//       $group: {
//         _id: null,
//         credits: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
//         debits: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
//       },
//     },
//   ]).session(session);

//   const stored = toMoneyNumber(wallet.balance ?? 0);
//   const credits = toMoneyNumber(sum?.credits ?? 0);
//   const debits = toMoneyNumber(sum?.debits ?? 0);

//   const storedSafe = Number.isFinite(stored) ? stored : 0;
//   const calculated = Number.isFinite(credits) && Number.isFinite(debits) ? credits - debits : storedSafe;

//   if (Number.isFinite(stored) && Number.isFinite(calculated) && Math.abs(calculated - stored) > MONEY_EPSILON) {
//     console.warn(
//       `[Wallet] Balance discrepancy wallet=${walletObjectId.toString()} stored=${stored.toFixed(2)} calculated=${calculated.toFixed(2)}`
//     );
//   }

//   return { stored: storedSafe, calculated };
// };

const getOrCreateVendorWalletInSession = async (vendorId, session) => {
  const vendorObjectId = toObjectId(vendorId);
  if (!vendorObjectId) throw new ValidationError("Invalid vendor ID");

  const wallet = await VendorWallet.findOneAndUpdate(
    { user: vendorObjectId },
    { $setOnInsert: { user: vendorObjectId, balance: 0, transactions: [] } },
    { new: true, upsert: true, session }
  );

  if (!wallet) throw new ValidationError("Wallet not found");
  return wallet;
};

const ensureCommissionForRemit = async (commissionId, vendorId, session) => {
  const commissionObjectId = toObjectId(commissionId);
  const vendorObjectId = toObjectId(vendorId);

  if (!commissionObjectId) throw new ValidationError("Invalid commission ID");
  if (!vendorObjectId) throw new ValidationError("Invalid vendor ID");

  const commission = await Commission.findOne({
    _id: commissionObjectId,
    vendor: vendorObjectId,
    status: { $in: ["pending", "overdue"] },
  }).session(session);

  if (!commission) throw new NotFoundError("Commission");
  return commission;
};

const setCommissionIdempotencyKeyOnce = async (commission, commissionId, vendorId, session) => {
  const key = generateIdempotencyKey(String(commissionId), String(vendorId));

  const duplicate = await Commission.findOne({ remittanceIdempotencyKey: key }).session(session);
  if (duplicate) throw new ConflictError("Duplicate transaction detected");

  commission.remittanceIdempotencyKey = key;
  await commission.save({ session });

  return key;
};

const remitCommissionViaWallet = async (commissionId, vendorId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!checkCircuitBreaker()) {
      throw new ExternalServiceError(
        "Commission Service",
        "Service temporarily unavailable. Please try again later."
      );
    }

    const commission = await ensureCommissionForRemit(commissionId, vendorId, session);
    const idempotencyKey = await setCommissionIdempotencyKeyOnce(commission, commissionId, vendorId, session);

    const wallet = await getOrCreateVendorWalletInSession(vendorId, session);

    const commissionAmount = toMoneyNumber(commission.commissionAmount);
    if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) {
      throw new ValidationError("Invalid commission amount. Please contact support.");
    }

    const storedBalance = toMoneyNumber(wallet.balance);
    if (!Number.isFinite(storedBalance)) {
      throw new ValidationError("Invalid wallet balance. Please contact support.");
    }

    if (storedBalance < commissionAmount) {
      throw new ValidationError(
        `Insufficient wallet balance. Have: ₱${storedBalance.toFixed(2)}, Need: ₱${commissionAmount.toFixed(2)}`
      );
    }

    // const { calculated: calculatedBalance } = await verifyWalletBalance(wallet._id, session);
    // console.log("yawaaaaa", calculatedBalance)
    // if (!Number.isFinite(calculatedBalance) || calculatedBalance + MONEY_EPSILON < commissionAmount) {
    //   throw new ValidationError("Balance verification failed. Please try again.");
    // }

    const balanceBefore = storedBalance;
    const balanceAfter = balanceBefore - commissionAmount;
    
    const [walletTransaction] = await WalletTransaction.create(
      [
        {
          wallet: wallet._id,
          user: toObjectId(vendorId) ?? vendorId,
          type: "debit",
          amount: commissionAmount,
          description: `COD Commission remittance for Order #${commission.metadata?.orderNumber || commission.order}`,
          reference: `COMM-${commission._id}`,
          referenceType: "commission",
          referenceId: commission._id,
          status: "completed",
          balanceBefore,
          balanceAfter,
          metadata: {
            commissionId: commission._id,
            orderId: commission.order,
            commissionAmount,
            remittedAt: new Date(),
          },
        },
      ],
      { session }
    );

    const updatedWallet = await VendorWallet.findOneAndUpdate(
      { _id: wallet._id, balance: { $gte: commissionAmount } },
      {
        $inc: { balance: -commissionAmount },
        $push: {
          transactions: {
            type: "debit",
            amount: commissionAmount,
            description: `Commission remittance - ${commission.metadata?.orderNumber || commission.order}`,
            date: new Date(),
            reference: walletTransaction._id,
          },
        },
      },
      { new: true, session }
    );

    if (!updatedWallet) {
      throw new ValidationError("Failed to deduct from wallet. Balance may have changed.");
    }

    commission.status = "remitted";
    commission.remittedAt = new Date();
    commission.remittanceMethod = "wallet";
    commission.walletTransactionId = walletTransaction._id;
    commission.remittanceIdempotencyKey = idempotencyKey;

    commission.remittanceHistory.push({
      remittedAt: new Date(),
      amount: commissionAmount,
      method: "wallet",
      walletTransactionId: walletTransaction._id,
      referenceNumber: walletTransaction.reference,
      status: "completed",
      notes: `Remitted via wallet. Transaction ID: ${walletTransaction._id}`,
    });

    commission.statusHistory.push({
      status: "remitted",
      changedAt: new Date(),
      changedBy: userId,
      reason: "Remitted via wallet deduction",
    });

    await commission.save({ session });
    await session.commitTransaction();

    await Promise.all([invalidateCommissionCache(vendorId), invalidateWalletCache(vendorId)]);

    return {
      success: true,
      commission,
      transaction: walletTransaction,
      newBalance: updatedWallet.balance,
    };
  } catch (error) {
    await session.abortTransaction();
    recordFailure();
    throw error;
  } finally {
    session.endSession();
  }
};









/**
 * Admin: Get all commissions with filters
 */
const getAllCommissions = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      vendorId,
      shopId,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (vendorId && isValidObjectId(vendorId)) {
      query.vendor = vendorId;
    }
    if (shopId && isValidObjectId(shopId)) {
      query.shop = shopId;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [commissions, total, statusCounts] = await Promise.all([
      Commission.find(query)
        .populate("vendor", "name email")
        .populate("shop", "shopName")
        .populate("order", "orderNumber totalAmount status")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Commission.countDocuments(query),
      Commission.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$commissionAmount" },
          },
        },
      ]),
    ]);

    const statusSummary = {};
    statusCounts.forEach((item) => {
      statusSummary[item._id] = { count: item.count, total: item.total };
    });

    return {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      statusSummary,
    };
  } catch (error) {
    console.error("[Commission] Error getting all commissions:", error);
    throw error;
  }
};

/**
 * Admin: Get commission analytics
 */
const getCommissionAnalytics = async (period = "30d") => {
  try {
    const periodDays = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const [totalStats, dailyStats, topVendors, overdueAnalysis] =
      await Promise.all([
        // Total statistics
        Commission.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$commissionAmount" },
            },
          },
        ]),

        // Daily trends
        Commission.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                status: "$status",
              },
              count: { $sum: 1 },
              amount: { $sum: "$commissionAmount" },
            },
          },
          { $sort: { "_id.date": 1 } },
        ]),

        // Top vendors by pending commissions
        Commission.aggregate([
          { $match: { status: { $in: ["pending", "overdue"] } } },
          {
            $group: {
              _id: "$vendor",
              totalPending: { $sum: "$commissionAmount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { totalPending: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "vendorInfo",
            },
          },
          { $unwind: "$vendorInfo" },
          {
            $project: {
              vendorId: "$_id",
              vendorName: "$vendorInfo.name",
              vendorEmail: "$vendorInfo.email",
              totalPending: 1,
              count: 1,
            },
          },
        ]),

        // Overdue analysis
        Commission.aggregate([
          { $match: { status: "overdue" } },
          {
            $project: {
              daysOverdue: {
                $divide: [
                  { $subtract: [new Date(), "$dueDate"] },
                  1000 * 60 * 60 * 24,
                ],
              },
              commissionAmount: 1,
            },
          },
          {
            $bucket: {
              groupBy: "$daysOverdue",
              boundaries: [0, 7, 14, 30, 60, 90],
              default: "90+",
              output: {
                count: { $sum: 1 },
                totalAmount: { $sum: "$commissionAmount" },
              },
            },
          },
        ]),
      ]);

    return {
      period: `${periodDays} days`,
      totalStats,
      dailyStats,
      topVendors,
      overdueAnalysis,
    };
  } catch (error) {
    console.error("[Commission] Error getting analytics:", error);
    throw error;
  }
};

/**
 * Update commission status (admin only)
 */
const updateCommissionStatus = async (
  commissionId,
  newStatus,
  adminId,
  notes,
) => {
  try {
    if (!isValidObjectId(commissionId)) {
      throw new ValidationError("Invalid commission ID");
    }

    const validStatuses = [
      "pending",
      "remitted",
      "overdue",
      "waived",
      "disputed",
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError("Invalid status");
    }

    const commission = await Commission.findById(commissionId);
    if (!commission) {
      throw new NotFoundError("Commission");
    }

    commission.status = newStatus;
    commission.adminNotes = sanitizeString(notes || "");
    commission.statusHistory.push({
      status: newStatus,
      changedAt: new Date(),
      changedBy: adminId,
      reason: sanitizeString(
        notes || `Status changed to ${newStatus} by admin`,
      ),
    });

    if (newStatus === "remitted") {
      commission.remittedAt = new Date();
      commission.remittanceMethod = "manual";
    }

    await commission.save();

    // Invalidate cache
    await invalidateCommissionCache(commission.vendor.toString());

    return commission;
  } catch (error) {
    console.error("[Commission] Error updating status:", error);
    throw error;
  }
};

/**
 * Cache invalidation helpers
 */
const invalidateCommissionCache = async (vendorId) => {
  try {
    await Promise.all([
      delAsync(`commissions:pending:${vendorId}`),
      delAsync(`commissions:summary:${vendorId}`),
    ]);
  } catch (error) {
    console.error("[Commission] Cache invalidation error:", error);
  }
};

const invalidateWalletCache = async (userId) => {
  try {
    await Promise.all([
      delAsync(`wallet:${userId}`),
      delAsync(`wallet:balance:${userId}`),
    ]);
  } catch (error) {
    console.error("[Wallet] Cache invalidation error:", error);
  }
};

/**
 * Get commissions due for reminder (called by cron job)
 */
const getCommissionsDueForReminder = async () => {
  return Commission.getCommissionsNeedingReminders();
};

/**
 * Mark reminder as sent
 */
const markReminderSent = async (commissionId) => {
  await Commission.findByIdAndUpdate(commissionId, {
    $inc: { remindersSent: 1 },
    lastReminderSentAt: new Date(),
  });
};

module.exports = {
  createCODCommission,
  getPendingCommissions,
  getCommissionSummary,
  getRemittanceHistory,
  remitCommissionViaWallet,
  bulkRemitCommissions,
  getAllCommissions,
  getCommissionAnalytics,
  updateCommissionStatus,
  getCommissionsDueForReminder,
  markReminderSent,
  invalidateCommissionCache,
};
