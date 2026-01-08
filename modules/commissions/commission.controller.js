/**
 * Commission Controller
 * Handles HTTP requests for commission management
 */
const commissionService = require('./commission.service');
const { validationResult } = require('express-validator');


/**
 * Get pending commissions for the logged-in vendor
 */
const getPendingCommissions = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    console.log('Vendor ID:', vendorId);
    const { page = 1, limit = 20, status } = req.query;
    
    const result = await commissionService.getPendingCommissions(vendorId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 per page
      status
    });
    
    res.status(200).json({
      success: true,
      message: 'Pending commissions retrieved successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get commission summary for vendor dashboard
 */
const getCommissionSummary = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const summary = await commissionService.getCommissionSummary(vendorId);
    
    res.status(200).json({
      success: true,
      message: 'Commission summary retrieved successfully',
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get remittance history for vendor
 */
const getRemittanceHistory = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const history = await commissionService.getRemittanceHistory(vendorId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100)
    });
    
    res.status(200).json({
      success: true,
      message: 'Remittance history retrieved successfully',
      data: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remit a single commission via wallet
 */
const remitCommission = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { commissionId } = req.params;
    const vendorId = req.user.id;
    
    const result = await commissionService.remitCommissionViaWallet(
      commissionId,
      vendorId,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      message: 'Commission remitted successfully',
      data: {
        commission: {
          id: result.commission._id,
          amount: result.commission.commissionAmount,
          status: result.commission.status,
          remittedAt: result.commission.remittedAt
        },
        newWalletBalance: result.newBalance,
        transactionId: result.transaction._id
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk remit multiple commissions
 */
const bulkRemitCommissions = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { commissionIds } = req.body;
    const vendorId = req.user.id;
    
    if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of commission IDs'
      });
    }
    
    // Limit bulk operations
    if (commissionIds.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 20 commissions can be remitted at once'
      });
    }
    
    const results = await commissionService.bulkRemitCommissions(
      commissionIds,
      vendorId,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      message: `Processed ${commissionIds.length} commissions`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Get all commissions with filters
 */
const getAllCommissions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      vendorId,
      shopId,
      startDate,
      endDate,
      sortBy,
      sortOrder
    } = req.query;
    
    const result = await commissionService.getAllCommissions({
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      status,
      vendorId,
      shopId,
      startDate,
      endDate,
      sortBy,
      sortOrder
    });
    
    res.status(200).json({
      success: true,
      message: 'Commissions retrieved successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Get commission analytics
 */
const getCommissionAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = await commissionService.getCommissionAnalytics(period);
    
    res.status(200).json({
      success: true,
      message: 'Commission analytics retrieved successfully',
      data: analytics
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Update commission status
 */
const updateCommissionStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { commissionId } = req.params;
    const { status, notes } = req.body;
    
    const commission = await commissionService.updateCommissionStatus(
      commissionId,
      status,
      req.user.id,
      notes
    );
    
    res.status(200).json({
      success: true,
      message: 'Commission status updated successfully',
      data: commission
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Get commission by ID
 */
const getCommissionById = async (req, res, next) => {
  try {
    const { commissionId } = req.params;
    const Commission = require('./commission.model');
    
    const commission = await Commission.findById(commissionId)
      .populate('vendor', 'name email')
      .populate('shop', 'shopName')
      .populate('order', 'orderNumber totalAmount status items')
      .populate('walletTransactionId');
    
    if (!commission) {
      return res.status(404).json({
        success: false,
        message: 'Commission not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: commission
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Get all vendors with pending commissions
 */
const getVendorsWithPendingCommissions = async (req, res, next) => {
  try {
    const Commission = require('./commission.model');
    
    const vendors = await Commission.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'overdue'] }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'vendor',
          foreignField: '_id',
          as: 'vendorData'
        }
      },
      {
        $unwind: '$vendorData'
      },
      {
        $lookup: {
          from: 'orders',
          localField: 'order',
          foreignField: '_id',
          as: 'orderData'
        }
      },
      {
        $unwind: { path: '$orderData', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: '$vendor',
          vendorId: { $first: '$vendor' },
          vendorName: { $first: '$vendorData.name' },
          vendorEmail: { $first: '$vendorData.email' },
          vendorPhone: { $first: '$vendorData.phone' },
          totalPending: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
          commissions: {
            $push: {
              _id: '$_id',
              commissionAmount: '$commissionAmount',
              status: '$status',
              dueDate: '$dueDate',
              createdAt: '$createdAt',
              order: {
                _id: '$orderData._id',
                orderNumber: '$orderData.orderNumber'
              }
            }
          },
          oldestDueDate: { $min: '$dueDate' }
        }
      },
      {
        $sort: { totalPending: -1 }
      }
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Vendors with pending commissions retrieved',
      data: {
        vendors,
        totalVendors: vendors.length,
        totalPendingAmount: vendors.reduce((sum, v) => sum + v.totalPending, 0)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Send reminder to vendor
 */
const sendReminderToVendor = async (req, res, next) => {
  try {
    const { vendorId } = req.body;
    const notificationService = require('../notifications/notification.service');
    const Commission = require('./commission.model');
    const User = require('../users/user.model');
    
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }
    
    // Get vendor details
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Get pending commissions total
    const pendingTotal = await Commission.aggregate([
      {
        $match: {
          vendor: vendor._id,
          status: { $in: ['pending', 'overdue'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const amount = pendingTotal[0]?.total || 0;
    const count = pendingTotal[0]?.count || 0;
    
    // Send notification
    await notificationService.createNotification({
      userId: vendorId,
      type: 'commission_reminder',
      title: 'Commission Reminder',
      message: `You have ${count} pending commission(s) totaling ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Please remit your platform commission as soon as possible.`,
      priority: 'high',
      referenceType: 'commission',
      metadata: {
        totalAmount: amount,
        commissionCount: count,
        sentBy: 'admin'
      }
    });
    
    // Update reminder count on commissions
    await Commission.updateMany(
      { vendor: vendorId, status: { $in: ['pending', 'overdue'] } },
      { 
        $inc: { remindersSent: 1 },
        $set: { lastReminderSent: new Date() }
      }
    );
    
    res.status(200).json({
      success: true,
      message: `Reminder sent to ${vendor.name}`
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingCommissions,
  getCommissionSummary,
  getRemittanceHistory,
  remitCommission,
  bulkRemitCommissions,
  getAllCommissions,
  getCommissionAnalytics,
  updateCommissionStatus,
  getCommissionById,
  getVendorsWithPendingCommissions,
  sendReminderToVendor
};
