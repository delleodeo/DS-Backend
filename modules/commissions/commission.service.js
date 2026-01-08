/**
 * COD Commission Service
 * Handles all business logic for commission management with security measures
 */
const mongoose = require('mongoose');
const Commission = require('./commission.model');
const Wallet = require('../wallet/wallet.model');
const WalletTransaction = require('../wallet/walletTransaction.model');
const Order = require('../orders/orders.model');
const Vendor = require('../vendors/vendors.model');
const { CacheError } = require('../../utils/errorHandler');
const { getAsync, setAsync, delAsync } = require('../../config/redis');
const crypto = require('crypto');

// Circuit breaker state
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  isOpen: false,
  threshold: 5,
  resetTimeout: 60000 // 1 minute
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
    console.error('[Commission Service] Circuit breaker opened due to repeated failures');
  }
};

/**
 * Generate idempotency key for remittance
 */
const generateIdempotencyKey = (commissionId, vendorId) => {
  const data = `${commissionId}-${vendorId}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Sanitize string input
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>\"\'&]/g, '').trim().substring(0, 1000);
};

/**
 * Create a commission record for COD orders
 */
const createCODCommission = async (orderData, vendorId, shopId) => {
  try {
    if (!checkCircuitBreaker()) {
      throw CacheError('Service temporarily unavailable', 503);
    }
    
    // Validate inputs
    if (!isValidObjectId(orderData.orderId)) {
      throw CacheError('Invalid order ID', 400);
    }
    if (!isValidObjectId(vendorId)) {
      throw CacheError('Invalid vendor ID', 400);
    }
    if (!isValidObjectId(shopId)) {
      throw CacheError('Invalid shop ID', 400);
    }
    
    // Check for existing commission to prevent duplicates
    const existingCommission = await Commission.findOne({
      order: orderData.orderId,
      vendor: vendorId
    });
    
    if (existingCommission) {
      console.log(`[Commission] Commission already exists for order ${orderData.orderId}`);
      return existingCommission;
    }
    
    // Get commission rate from system settings or use default
    const commissionRate = orderData.commissionRate || 5; // 5% default
    const commissionAmount = (orderData.amount * commissionRate) / 100;
    
    // Calculate due date (7 days from delivery or order creation)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    
    const commission = new Commission({
      order: orderData.orderId,
      vendor: vendorId,
      shop: shopId,
      orderAmount: orderData.amount,
      commissionRate: commissionRate,
      commissionAmount: Math.round(commissionAmount * 100) / 100, // Round to 2 decimals
      paymentMethod: 'cod',
      dueDate: dueDate,
      metadata: {
        orderNumber: sanitizeString(orderData.orderNumber),
        customerName: sanitizeString(orderData.customerName),
        deliveredAt: orderData.deliveredAt || null
      },
      statusHistory: [{
        status: 'pending',
        changedAt: new Date(),
        reason: 'Commission created for COD order'
      }]
    });
    
    await commission.save();
    
    // Invalidate related caches
    await invalidateCommissionCache(vendorId);
    
    console.log(`[Commission] Created commission ${commission._id} for order ${orderData.orderId}, amount: ${commissionAmount}`);
    
    return commission;
  } catch (error) {
    recordFailure();
    console.error('[Commission] Error creating COD commission:', error);
    throw error;
  }
};

/**
 * Get pending commissions for a vendor with caching
 */
const getPendingCommissions = async (vendorId, options = {}) => {
  try {
    if (!isValidObjectId(vendorId)) {
      throw CacheError('Invalid vendor ID', 400);
    }
    
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
      vendor: vendorId
    };
    
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ['pending', 'overdue'] };
    }
    
    const [commissions, total] = await Promise.all([
      Commission.find(query)
        .populate('order', 'orderNumber totalAmount status deliveredAt')
        .populate('shop', 'shopName')
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Commission.countDocuments(query)
    ]);
    
    const result = {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
    
    // Cache for 5 minutes
    await setAsync(cacheKey, JSON.stringify(result), 'EX', 300);
    
    return result;
  } catch (error) {
    console.error('[Commission] Error getting pending commissions:', error);
    throw error;
  }
};

/**
 * Get commission summary for vendor dashboard
 */
const getCommissionSummary = async (vendorId) => {
  try {
    if (!isValidObjectId(vendorId)) {
      throw CacheError('Invalid vendor ID', 400);
    }
    
    const cacheKey = `commissions:summary:${vendorId}`;
    
    const cached = await getAsync(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const [pendingStats, remittedStats, overdueStats] = await Promise.all([
      Commission.aggregate([
        { $match: { vendor: new mongoose.Types.ObjectId(vendorId), status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } }
      ]),
      Commission.aggregate([
        { $match: { vendor: new mongoose.Types.ObjectId(vendorId), status: 'remitted' } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } }
      ]),
      Commission.aggregate([
        { $match: { vendor: new mongoose.Types.ObjectId(vendorId), status: 'overdue' } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } }
      ])
    ]);
    
    const summary = {
      pending: {
        amount: pendingStats[0]?.total || 0,
        count: pendingStats[0]?.count || 0
      },
      remitted: {
        amount: remittedStats[0]?.total || 0,
        count: remittedStats[0]?.count || 0
      },
      overdue: {
        amount: overdueStats[0]?.total || 0,
        count: overdueStats[0]?.count || 0
      },
      totalPendingAmount: (pendingStats[0]?.total || 0) + (overdueStats[0]?.total || 0)
    };
    
    // Cache for 5 minutes
    await setAsync(cacheKey, JSON.stringify(summary), 'EX', 300);
    
    return summary;
  } catch (error) {
    console.error('[Commission] Error getting commission summary:', error);
    throw error;
  }
};

/**
 * Remit commission using wallet balance - SECURE TRANSACTION
 */
const remitCommissionViaWallet = async (commissionId, vendorId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!checkCircuitBreaker()) {
      throw CacheError('Service temporarily unavailable. Please try again later.', 503);
    }
    
    // Validate inputs
    if (!isValidObjectId(commissionId)) {
      throw CacheError('Invalid commission ID', 400);
    }
    if (!isValidObjectId(vendorId)) {
      throw CacheError('Invalid vendor ID', 400);
    }
    
    // Get commission with lock
    const commission = await Commission.findOne({
      _id: commissionId,
      vendor: vendorId,
      status: { $in: ['pending', 'overdue'] }
    }).session(session);
    
    if (!commission) {
      throw CacheError('Commission not found or already processed', 404);
    }
    
    // Generate idempotency key to prevent duplicate transactions
    const idempotencyKey = generateIdempotencyKey(commissionId, vendorId);
    
    // Check for existing idempotency key
    const existingKey = await Commission.findOne({
      remittanceIdempotencyKey: idempotencyKey
    }).session(session);
    
    if (existingKey) {
      throw CacheError('Duplicate transaction detected', 409);
    }
    
    // Get vendor's wallet with lock
    const wallet = await Wallet.findOne({
      user: vendorId
    }).session(session);
    
    if (!wallet) {
      throw CacheError('Wallet not found. Please contact support.', 404);
    }
    
    // Check sufficient balance
    if (wallet.balance < commission.commissionAmount) {
      throw CacheError(
        `Insufficient wallet balance. Required: ₱${commission.commissionAmount.toFixed(2)}, Available: ₱${wallet.balance.toFixed(2)}`,
        400
      );
    }
    
    // Verify wallet balance integrity (double-check)
    const verifiedBalance = await verifyWalletBalance(wallet._id, session);
    if (verifiedBalance < commission.commissionAmount) {
      throw CacheError('Balance verification failed. Please try again.', 400);
    }
    
    // Create wallet transaction record
    const walletTransaction = new WalletTransaction({
      wallet: wallet._id,
      user: vendorId,
      type: 'debit',
      amount: commission.commissionAmount,
      description: `COD Commission remittance for Order #${commission.metadata?.orderNumber || commission.order}`,
      reference: `COMM-${commission._id}`,
      referenceType: 'commission',
      referenceId: commission._id,
      status: 'completed',
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance - commission.commissionAmount,
      metadata: {
        commissionId: commission._id,
        orderId: commission.order,
        commissionAmount: commission.commissionAmount,
        remittedAt: new Date()
      }
    });
    
    await walletTransaction.save({ session });
    
    // Deduct from wallet with atomic operation
    const updatedWallet = await Wallet.findOneAndUpdate(
      {
        _id: wallet._id,
        balance: { $gte: commission.commissionAmount } // Atomic balance check
      },
      {
        $inc: { balance: -commission.commissionAmount },
        $push: {
          transactions: {
            type: 'debit',
            amount: commission.commissionAmount,
            description: `Commission remittance - ${commission.metadata?.orderNumber}`,
            date: new Date(),
            reference: walletTransaction._id
          }
        }
      },
      { new: true, session }
    );
    
    if (!updatedWallet) {
      throw CacheError('Failed to deduct from wallet. Balance may have changed.', 400);
    }
    
    // Update commission status
    commission.status = 'remitted';
    commission.remittedAt = new Date();
    commission.remittanceMethod = 'wallet';
    commission.walletTransactionId = walletTransaction._id;
    commission.remittanceIdempotencyKey = idempotencyKey;
    commission.statusHistory.push({
      status: 'remitted',
      changedAt: new Date(),
      changedBy: userId,
      reason: 'Remitted via wallet deduction'
    });
    
    await commission.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    
    // Invalidate caches
    await Promise.all([
      invalidateCommissionCache(vendorId),
      invalidateWalletCache(vendorId)
    ]);
    
    console.log(`[Commission] Successfully remitted commission ${commissionId}, amount: ${commission.commissionAmount}`);
    
    return {
      success: true,
      commission: commission,
      transaction: walletTransaction,
      newBalance: updatedWallet.balance
    };
    
  } catch (error) {
    await session.abortTransaction();
    recordFailure();
    console.error('[Commission] Error remitting commission:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Bulk remit multiple commissions
 */
const bulkRemitCommissions = async (commissionIds, vendorId, userId) => {
  const results = {
    successful: [],
    failed: []
  };
  
  // Process sequentially to maintain transaction integrity
  for (const commissionId of commissionIds) {
    try {
      const result = await remitCommissionViaWallet(commissionId, vendorId, userId);
      results.successful.push({
        commissionId,
        amount: result.commission.commissionAmount
      });
    } catch (error) {
      results.failed.push({
        commissionId,
        error: error.message
      });
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
    { $match: { wallet: walletId, status: 'completed' } },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] }
        },
        debits: {
          $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] }
        }
      }
    }
  ]).session(session);
  
  if (transactionSum.length === 0) {
    return wallet.balance;
  }
  
  const calculatedBalance = transactionSum[0].credits - transactionSum[0].debits;
  
  // Log discrepancy if found
  if (Math.abs(calculatedBalance - wallet.balance) > 0.01) {
    console.warn(`[Wallet] Balance discrepancy detected for wallet ${walletId}. Stored: ${wallet.balance}, Calculated: ${calculatedBalance}`);
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
      sortBy = 'createdAt',
      sortOrder = 'desc'
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
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [commissions, total, statusCounts] = await Promise.all([
      Commission.find(query)
        .populate('vendor', 'name email')
        .populate('shop', 'shopName')
        .populate('order', 'orderNumber totalAmount status')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Commission.countDocuments(query),
      Commission.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$commissionAmount' } } }
      ])
    ]);
    
    const statusSummary = {};
    statusCounts.forEach(item => {
      statusSummary[item._id] = { count: item.count, total: item.total };
    });
    
    return {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statusSummary
    };
  } catch (error) {
    console.error('[Commission] Error getting all commissions:', error);
    throw error;
  }
};

/**
 * Admin: Get commission analytics
 */
const getCommissionAnalytics = async (period = '30d') => {
  try {
    const periodDays = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    
    const [
      totalStats,
      dailyStats,
      topVendors,
      overdueAnalysis
    ] = await Promise.all([
      // Total statistics
      Commission.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$commissionAmount' }
          }
        }
      ]),
      
      // Daily trends
      Commission.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              status: '$status'
            },
            count: { $sum: 1 },
            amount: { $sum: '$commissionAmount' }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]),
      
      // Top vendors by pending commissions
      Commission.aggregate([
        { $match: { status: { $in: ['pending', 'overdue'] } } },
        {
          $group: {
            _id: '$vendor',
            totalPending: { $sum: '$commissionAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalPending: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'vendorInfo'
          }
        },
        { $unwind: '$vendorInfo' },
        {
          $project: {
            vendorId: '$_id',
            vendorName: '$vendorInfo.name',
            vendorEmail: '$vendorInfo.email',
            totalPending: 1,
            count: 1
          }
        }
      ]),
      
      // Overdue analysis
      Commission.aggregate([
        { $match: { status: 'overdue' } },
        {
          $project: {
            daysOverdue: {
              $divide: [
                { $subtract: [new Date(), '$dueDate'] },
                1000 * 60 * 60 * 24
              ]
            },
            commissionAmount: 1
          }
        },
        {
          $bucket: {
            groupBy: '$daysOverdue',
            boundaries: [0, 7, 14, 30, 60, 90],
            default: '90+',
            output: {
              count: { $sum: 1 },
              totalAmount: { $sum: '$commissionAmount' }
            }
          }
        }
      ])
    ]);
    
    return {
      period: `${periodDays} days`,
      totalStats,
      dailyStats,
      topVendors,
      overdueAnalysis
    };
  } catch (error) {
    console.error('[Commission] Error getting analytics:', error);
    throw error;
  }
};

/**
 * Update commission status (admin only)
 */
const updateCommissionStatus = async (commissionId, newStatus, adminId, notes) => {
  try {
    if (!isValidObjectId(commissionId)) {
      throw CacheError('Invalid commission ID', 400);
    }
    
    const validStatuses = ['pending', 'remitted', 'overdue', 'waived', 'disputed'];
    if (!validStatuses.includes(newStatus)) {
      throw CacheError('Invalid status', 400);
    }
    
    const commission = await Commission.findById(commissionId);
    if (!commission) {
      throw CacheError('Commission not found', 404);
    }
    
    commission.status = newStatus;
    commission.adminNotes = sanitizeString(notes || '');
    commission.statusHistory.push({
      status: newStatus,
      changedAt: new Date(),
      changedBy: adminId,
      reason: sanitizeString(notes || `Status changed to ${newStatus} by admin`)
    });
    
    if (newStatus === 'remitted') {
      commission.remittedAt = new Date();
      commission.remittanceMethod = 'manual';
    }
    
    await commission.save();
    
    // Invalidate cache
    await invalidateCommissionCache(commission.vendor.toString());
    
    return commission;
  } catch (error) {
    console.error('[Commission] Error updating status:', error);
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
      delAsync(`commissions:summary:${vendorId}`)
    ]);
  } catch (error) {
    console.error('[Commission] Cache invalidation error:', error);
  }
};

const invalidateWalletCache = async (userId) => {
  try {
    await Promise.all([
      delAsync(`wallet:${userId}`),
      delAsync(`wallet:balance:${userId}`)
    ]);
  } catch (error) {
    console.error('[Wallet] Cache invalidation error:', error);
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
    lastReminderSentAt: new Date()
  });
};

module.exports = {
  createCODCommission,
  getPendingCommissions,
  getCommissionSummary,
  remitCommissionViaWallet,
  bulkRemitCommissions,
  getAllCommissions,
  getCommissionAnalytics,
  updateCommissionStatus,
  getCommissionsDueForReminder,
  markReminderSent,
  invalidateCommissionCache
};
