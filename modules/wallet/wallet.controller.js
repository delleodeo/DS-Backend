/**
 * Wallet Controller
 * Handles HTTP requests for wallet operations
 */
const walletService = require('./wallet.service');
const { validationResult } = require('express-validator');

/**
 * Get wallet balance
 */
const getBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const balance = await walletService.getBalance(userId);
    
    res.status(200).json({
      success: true,
      data: {
        balance,
        currency: 'PHP'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get wallet details
 */
const getWalletDetails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const wallet = await walletService.getOrCreateWallet(userId);
    
    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        usdtBalance: wallet.usdtBalance,
        currency: wallet.currency,
        isLocked: wallet.isLocked,
        lastActivityAt: wallet.lastActivityAt,
        recentTransactions: wallet.recentTransactions?.slice(0, 5) || []
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction history
 */
const getTransactionHistory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const userId = req.user._id;
    const { page = 1, limit = 20, type, status, startDate, endDate } = req.query;
    
    const result = await walletService.getTransactionHistory(userId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      type,
      status,
      startDate,
      endDate
    });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify balance integrity (for users to check)
 */
const verifyBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await walletService.verifyBalanceIntegrity(userId);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Lock wallet
 */
const lockWallet = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { userId } = req.params;
    const { reason } = req.body;
    
    const wallet = await walletService.lockWallet(userId, reason, req.user._id);
    
    res.status(200).json({
      success: true,
      message: 'Wallet locked successfully',
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Unlock wallet
 */
const unlockWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const wallet = await walletService.unlockWallet(userId, req.user._id);
    
    res.status(200).json({
      success: true,
      message: 'Wallet unlocked successfully',
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get user wallet details
 */
const getAdminWalletDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const wallet = await walletService.getOrCreateWallet(userId);
    const integrity = await walletService.verifyBalanceIntegrity(userId);
    
    res.status(200).json({
      success: true,
      data: {
        wallet,
        balanceIntegrity: integrity
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBalance,
  getWalletDetails,
  getTransactionHistory,
  verifyBalance,
  lockWallet,
  unlockWallet,
  getAdminWalletDetails
};
