/**
 * Escrow Controller
 * Admin endpoints for managing payment releases and refunds
 */

const EscrowService = require('../services/escrow.service');
const sanitizeMongoInput = require('../../../utils/sanitizeMongoInput');
const { validateId } = require('../../../utils/validation');

// ============================================
// ESCROW DASHBOARD
// ============================================

/**
 * Get escrow summary for admin dashboard
 */
exports.getEscrowSummary = async (req, res) => {
  try {
    const summary = await EscrowService.getEscrowSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Get Escrow Summary Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// PAYMENT RELEASE MANAGEMENT
// ============================================

/**
 * Get all pending payment releases
 */
exports.getPendingReleases = async (req, res) => {
  try {
    const { page = 1, limit = 20, vendorId, minAmount, maxAmount } = req.query;
    
    const result = await EscrowService.getPendingReleases(
      { vendorId, minAmount, maxAmount },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Pending Releases Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get releases on hold
 */
exports.getHeldReleases = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const result = await EscrowService.getHeldReleases({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Held Releases Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get sellers with pending releases
 */
exports.getSellersWithPendingReleases = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const result = await EscrowService.getSellersWithPendingReleases({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Sellers With Pending Releases Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Release payment to seller (Admin action)
 */
exports.releasePayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    
    const result = await EscrowService.releasePaymentToSeller(
      orderId,
      adminId,
      adminEmail,
      notes,
      req
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Release Payment Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Bulk release multiple payments (Admin action)
 */
exports.bulkReleasePayments = async (req, res) => {
  try {
    const { releaseIds, notes } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    
    if (!Array.isArray(releaseIds) || releaseIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'releaseIds must be a non-empty array' 
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const releaseId of releaseIds) {
      try {
        const result = await EscrowService.releasePaymentToSeller(
          releaseId,
          adminId,
          adminEmail,
          notes || 'Bulk release',
          req
        );
        results.successful.push({
          releaseId,
          sellerReceived: result.sellerReceived
        });
      } catch (error) {
        results.failed.push({
          releaseId,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        totalProcessed: releaseIds.length,
        successCount: results.successful.length,
        failedCount: results.failed.length,
        results
      }
    });
  } catch (error) {
    console.error('Bulk Release Payments Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Put payment on hold (Admin action)
 */
exports.holdPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    
    if (!reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Hold reason is required' 
      });
    }
    
    const result = await EscrowService.holdPayment(
      orderId,
      adminId,
      adminEmail,
      reason,
      req
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Hold Payment Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// REFUND MANAGEMENT
// ============================================

/**
 * Get pending refund requests
 */
exports.getPendingRefunds = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const result = await EscrowService.getPendingRefunds({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Pending Refunds Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Approve refund request (Admin action)
 */
exports.approveRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    
    const result = await EscrowService.approveRefund(
      orderId,
      adminId,
      adminEmail,
      notes,
      req
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Approve Refund Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Reject refund request (Admin action)
 */
exports.rejectRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    
    if (!reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Rejection reason is required' 
      });
    }
    
    const result = await EscrowService.rejectRefund(
      orderId,
      adminId,
      adminEmail,
      reason,
      req
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Reject Refund Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// CUSTOMER REFUND REQUEST
// ============================================

/**
 * Customer requests refund (can be called from order routes)
 */
exports.requestRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    // Sanitize and validate inputs
    validateId(String(orderId), 'orderId');
    const sanitizedBody = sanitizeMongoInput(req.body);
    const { reason, reasonDetails } = sanitizedBody;
    // Handle both id and _id since JWT might use either format
    const customerId = req.user._id || req.user.id;
    
    if (!customerId) {
      return res.status(401).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }
    
    if (!reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refund reason is required' 
      });
    }
    
    const result = await EscrowService.requestRefund(
      orderId,
      customerId,
      reason,
      reasonDetails
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Request Refund Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Customer cancels a pending refund request
 */
exports.cancelRefundRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const customerId = req.user._id || req.user.id;

    const result = await EscrowService.cancelRefundRequest(orderId, customerId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Cancel Refund Request Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// VENDOR ESCROW DASHBOARD
// ============================================

/**
 * Get vendor escrow dashboard data
 */
exports.getVendorEscrowDashboard = async (req, res) => {
  try {
    const vendorUserId = req.params.vendorId || req.user._id;
    
    const result = await EscrowService.getVendorEscrowDashboard(vendorUserId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Vendor Escrow Dashboard Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// COD COMMISSION MANAGEMENT
// ============================================

/**
 * Get vendor's pending COD commissions
 */
exports.getVendorPendingCODCommissions = async (req, res) => {
  try {
    const vendorUserId = req.params.vendorId || req.user._id;
    
    const result = await EscrowService.getVendorPendingCODCommissions(vendorUserId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Vendor Pending COD Commissions Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Seller remits COD commission for a single order
 */
exports.remitCODCommission = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod = 'wallet' } = req.body;
    const vendorUserId = req.user._id;
    
    // Validate payment method
    if (!['wallet', 'gcash', 'bank_transfer'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method. Use: wallet, gcash, or bank_transfer'
      });
    }
    
    const result = await EscrowService.remitCODCommission(orderId, vendorUserId, paymentMethod);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Remit COD Commission Error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Seller bulk remits COD commissions for multiple orders
 */
exports.bulkRemitCODCommissions = async (req, res) => {
  try {
    const { orderIds } = req.body;
    const vendorUserId = req.user._id;
    
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'orderIds must be a non-empty array'
      });
    }
    
    const result = await EscrowService.bulkRemitCODCommissions(orderIds, vendorUserId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Bulk Remit COD Commissions Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// TRANSACTION HISTORY
// ============================================

/**
 * Get vendor transaction history
 */
exports.getVendorTransactions = async (req, res) => {
  try {
    const vendorUserId = req.params.vendorId || req.user._id;
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;
    
    const result = await EscrowService.getVendorTransactions(
      vendorUserId,
      { type, startDate, endDate },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Vendor Transactions Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get vendor transaction summary
 */
exports.getVendorTransactionSummary = async (req, res) => {
  try {
    const vendorUserId = req.params.vendorId || req.user._id;
    
    const result = await EscrowService.getVendorTransactionSummary(vendorUserId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Vendor Transaction Summary Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get admin transaction history (all platform transactions)
 */
exports.getAdminTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, vendorId, startDate, endDate } = req.query;
    
    const result = await EscrowService.getAdminTransactions(
      { type, vendorId, startDate, endDate },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get Admin Transactions Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
