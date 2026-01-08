/**
 * COD Commission Service
 * Handles all business logic for commission management with security measures
 */
const mongoose = require("mongoose");
const Commission = require("./commission.model");
const Wallet = require("../wallet/wallet.model");
const WalletTransaction = require("../wallet/walletTransaction.model");
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
      "[Commission Service] Circuit breaker opened due to repeated failures"
    );
  }
};

/**
 * Generate idempotency key for remittance
 */
const generateIdempotencyKey = (commissionId, vendorId) => {
  // Deterministic per commission/vendor to block concurrent duplicates
  const data = `${commissionId}:${vendorId}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.isValidObjectId(id);
};

/**
 * Sanitize string input
 */
const sanitizeString = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/[<>\"\'&]/g, "")
    .trim()
    .substring(0, 1000);
};

/**
 * Create a commission record for COD orders
 */
const createCODCommission = async (orderData, vendorId, shopId) => {
  try {
    if (!checkCircuitBreaker()) {
      throw new ExternalServiceError(
        "Commission Service",
        "Service temporarily unavailable"
      );
    }

    // Validate inputs
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
        `[Commission] Commission already exists for order ${orderData.orderId}`
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
      `[Commission] Created commission ${commission._id} for order ${orderData.orderId}, amount: ${commissionAmount}`
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
      JSON.stringify(query)
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
      `[Commission] Found ${commissions.length} commissions for vendor ${vendorId}`
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
 * Remit commission using wallet balance - SECURE TRANSACTION
 * TIER 1 SECURITY: Server-side authorization with fresh data verification
 */
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

    // Validate inputs
    if (!isValidObjectId(commissionId)) {
      throw new ValidationError("Invalid commission ID");
    }
    if (!isValidObjectId(vendorId)) {
      throw new ValidationError("Invalid vendor ID");
    }

    // Convert to ObjectId for consistent comparison
    const commissionObjectId = new mongoose.Types.ObjectId(commissionId);
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    console.log(
      `[Commission Remit] Starting remittance: commission=${commissionId}, vendor=${vendorId}`
    );

    // Get commission with lock
    const commission = await Commission.findOne({
      _id: commissionObjectId,
      vendor: vendorObjectId,
      status: { $in: ["pending", "overdue"] },
    }).session(session);

    if (!commission) {
      throw new NotFoundError("Commission");
    }

    // Generate deterministic idempotency key and pre-lock the commission to prevent concurrent double-remit
    const idempotencyKey = generateIdempotencyKey(commissionId, vendorId);
    const existingKey = await Commission.findOne({
      remittanceIdempotencyKey: idempotencyKey,
    }).session(session);
    if (existingKey) {
      throw new ConflictError("Duplicate transaction detected");
    }

    // Pre-set the idempotency key on this commission inside the transaction; rollback will release it
    commission.remittanceIdempotencyKey = idempotencyKey;
    await commission.save({ session });

    // Fetch vendor so we can seed a missing wallet
    const vendor = await Vendor.findOne({
      $or: [{ _id: vendorObjectId }, { userId: vendorObjectId }],
    }).session(session);

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    const vendorCashBalance =
      Number(
        vendor?.accountBalance?.cash ?? vendor?.accountBalance?.balance ?? 0
      ) || 0;

    // Get vendor's wallet with lock (auto-create from vendor.accountBalance if missing)
    let wallet = await Wallet.findOne({ user: vendorObjectId }).session(
      session
    );

    if (!wallet) {
      console.warn(
        `[Commission Remit] Wallet not found for vendor=${vendorId}, attempting auto-create from vendor.accountBalance`
      );
      const seedBalance = vendorCashBalance;
      wallet = await Wallet.findOneAndUpdate(
        { user: vendorObjectId },
        {
          $setOnInsert: {
            user: vendorObjectId,
            balance: seedBalance,
            currency: "PHP",
          },
        },
        { new: true, upsert: true, session }
      );
      console.log(
        `[Commission Remit] Wallet created for vendor=${vendorId}, seededBalance=${seedBalance}`
      );
    }

    // TIER 1 SECURITY: Explicit type conversions
    const balanceNumber = Number(wallet.balance);
    const commissionAmountNumber = Number(commission.commissionAmount);

    console.log(
      `[Commission Remit] Balance check: wallet=${
        wallet._id
      }, balanceType=${typeof balanceNumber}, balance=${balanceNumber}, amountType=${typeof commissionAmountNumber}, amount=${commissionAmountNumber}`
    );

    // Validate balance types
    if (isNaN(balanceNumber) || !isFinite(balanceNumber)) {
      console.error(
        `[Commission Remit] Invalid balance value: ${
          wallet.balance
        } (type: ${typeof wallet.balance})`
      );
      throw new ValidationError(
        "Invalid wallet balance. Please contact support."
      );
    }

    if (isNaN(commissionAmountNumber) || !isFinite(commissionAmountNumber)) {
      console.error(
        `[Commission Remit] Invalid commission amount: ${
          commission.commissionAmount
        } (type: ${typeof commission.commissionAmount})`
      );
      throw new ValidationError(
        "Invalid commission amount. Please contact support."
      );
    }

    // Check sufficient balance with explicit numeric comparison
    if (balanceNumber < commissionAmountNumber) {
      console.warn(
        `[Commission Remit] Insufficient balance: wallet=${wallet._id}, have=${balanceNumber}, need=${commissionAmountNumber}`
      );
      throw new ValidationError(
        `Insufficient wallet balance. Have: ₱${balanceNumber.toFixed(
          2
        )}, Need: ₱${commissionAmountNumber.toFixed(2)}`
      );
    }

    // Verify wallet balance integrity (double-check) with type safety
    const verifiedBalance = Number(
      await verifyWalletBalance(wallet._id, session)
    );
    const verifiedBalanceNumber = Number(commissionAmountNumber);

    console.log(
      `[Commission Remit] Balance verification: verified=${verifiedBalance}, required=${verifiedBalanceNumber}`
    );

    if (isNaN(verifiedBalance) || verifiedBalance < verifiedBalanceNumber) {
      console.error(
        `[Commission Remit] Balance verification failed: verified=${verifiedBalance}, required=${verifiedBalanceNumber}`
      );
      throw new ValidationError(
        "Balance verification failed. Please try again."
      );
    }

    // Create wallet transaction record
    const balanceBeforeNumber = Number(wallet.balance);
    const balanceAfterNumber = balanceBeforeNumber - commissionAmountNumber;

    const walletTransaction = new WalletTransaction({
      wallet: wallet._id,
      user: vendorId,
      type: "debit",
      amount: commissionAmountNumber,
      description: `COD Commission remittance for Order #${
        commission.metadata?.orderNumber || commission.order
      }`,
      reference: `COMM-${commission._id}`,
      referenceType: "commission",
      referenceId: commission._id,
      status: "completed",
      balanceBefore: balanceBeforeNumber,
      balanceAfter: balanceAfterNumber,
      metadata: {
        commissionId: commission._id,
        orderId: commission.order,
        commissionAmount: commissionAmountNumber,
        remittedAt: new Date(),
      },
    });

    await walletTransaction.save({ session });

    console.log(
      `[Commission Remit] Created transaction: id=${walletTransaction._id}, debit=${commissionAmountNumber}, before=${balanceBeforeNumber}, after=${balanceAfterNumber}`
    );

    // TIER 1 SECURITY: Deduct from wallet with atomic operation and explicit balance check
    const updatedWallet = await Wallet.findOneAndUpdate(
      {
        _id: wallet._id,
        balance: { $gte: commissionAmountNumber }, // Atomic balance check with numeric value
      },
      {
        $inc: { balance: -commissionAmountNumber },
        $push: {
          transactions: {
            type: "debit",
            amount: commissionAmountNumber,
            description: `Commission remittance - ${commission.metadata?.orderNumber}`,
            date: new Date(),
            reference: walletTransaction._id,
          },
        },
      },
      { new: true, session }
    );

    if (!updatedWallet) {
      console.error(
        `[Commission Remit] Failed to deduct: wallet=${wallet._id}, attempted deduction=${commissionAmountNumber}`
      );
      throw new ValidationError(
        "Failed to deduct from wallet. Balance may have changed."
      );
    }

    const updatedBalanceNumber = Number(updatedWallet.balance);
    console.log(
      `[Commission Remit] Wallet updated: wallet=${wallet._id}, newBalance=${updatedBalanceNumber}`
    );

    // Sync vendor.accountBalance with the authoritative wallet balance (same session)
    await Vendor.findOneAndUpdate(
      {
        $or: [{ _id: vendorObjectId }, { userId: vendorObjectId }],
      },
      {
        $set: {
          "accountBalance.cash": updatedBalanceNumber,
          "accountBalance.balance": updatedBalanceNumber,
          updatedAt: new Date(),
        },
      },
      { session, new: true }
    );

    // Update commission status with remittance history
    commission.status = "remitted";
    commission.remittedAt = new Date();
    commission.remittanceMethod = "wallet";
    commission.walletTransactionId = walletTransaction._id;
    commission.remittanceIdempotencyKey = idempotencyKey;

    // Add to remittance history
    commission.remittanceHistory.push({
      remittedAt: new Date(),
      amount: commission.commissionAmount,
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

    // Commit transaction
    await session.commitTransaction();

    // Invalidate caches
    await Promise.all([
      invalidateCommissionCache(vendorId),
      invalidateWalletCache(vendorId),
    ]);

    console.log(
      `[Commission] Successfully remitted commission ${commissionId}, amount: ${commission.commissionAmount}`
    );

    return {
      success: true,
      commission: commission,
      transaction: walletTransaction,
      newBalance: updatedWallet.balance,
    };
  } catch (error) {
    await session.abortTransaction();
    recordFailure();
    console.error("[Commission] Error remitting commission:", error);
    throw error;
  } finally {
    session.endSession();
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
          "order commissionAmount remittanceHistory remittedAt remittanceMethod"
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
        }))
      )
      .sort((a, b) => new Date(b.remittedAt) - new Date(a.remittedAt));

    const totalAmount = history.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
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

/**
 * Bulk remit multiple commissions
 */
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
        userId
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
const verifyWalletBalance = async (walletId, session) => {
  const wallet = await Wallet.findById(walletId).session(session);

  if (!wallet) return 0;

  // Calculate expected balance from transactions
  const transactionSum = await WalletTransaction.aggregate([
    { $match: { wallet: walletId, status: "completed" } },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
        },
        debits: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
        },
      },
    },
  ]).session(session);

  if (transactionSum.length === 0) {
    return wallet.balance;
  }

  const calculatedBalance =
    transactionSum[0].credits - transactionSum[0].debits;

  // Log discrepancy if found
  if (Math.abs(calculatedBalance - wallet.balance) > 0.01) {
    console.warn(
      `[Wallet] Balance discrepancy detected for wallet ${walletId}. Stored: ${wallet.balance}, Calculated: ${calculatedBalance}`
    );
  }

  return wallet.balance;
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
  notes
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
        notes || `Status changed to ${newStatus} by admin`
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
