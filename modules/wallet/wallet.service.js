/**
 * Wallet Service
 * Secure wallet operations with transaction management
 */
const mongoose = require('mongoose');
const Wallet = require('./userWallet.model');
const WalletTransaction = require('./walletTransaction.model');
const User = require('../users/users.model');
const { getAsync, setAsync, delAsync } = require('../../config/redis');
const { walletCircuitBreaker } = require('../../utils/circuitBreaker');
const crypto = require('crypto');

/**
 * Generate idempotency key
 */
const generateIdempotencyKey = (userId, operation, amount) => {
  const timestamp = Math.floor(Date.now() / 1000); // 1 second window
  const data = `${userId}-${operation}-${amount}-${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Validate amount
 */
const validateAmount = (amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Invalid amount');
  }
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  if (amount > 1000000) {
    throw new Error('Amount exceeds maximum limit');
  }
  return Math.round(amount * 100) / 100; // Round to 2 decimal places
};

/**
 * Get or create wallet for user
 */
const getOrCreateWallet = async (userId) => {
  try {
    // Try to get from Wallet collection first
    let wallet = await Wallet.findOne({ user: userId });
    
    if (!wallet) {
      // Get user's embedded wallet balance
      const user = await User.findById(userId).select('wallet');
      const existingBalance = user?.wallet?.cash || 0;
      
      // Create new wallet document
      wallet = new Wallet({
        user: userId,
        balance: existingBalance,
        usdtBalance: user?.wallet?.usdt || 0
      });
      await wallet.save();
    }
    
    return wallet;
  } catch (error) {
    console.error('[Wallet] Error getting/creating wallet:', error);
    throw error;
  }
};

/**
 * Get wallet balance with caching
 */
const getBalance = async (userId) => {
  try {
    const cacheKey = `wallet:balance:${userId}`;
    
    const cached = await getAsync(cacheKey);
    if (cached !== null) {
      return parseFloat(cached);
    }
    
    const wallet = await getOrCreateWallet(userId);
    
    // Cache for 5 minutes
    await setAsync(cacheKey, wallet.balance.toString(), 'EX', 300);
    
    return wallet.balance;
  } catch (error) {
    console.error('[Wallet] Error getting balance:', error);
    throw error;
  }
};

/**
 * Credit wallet (add money) - SECURE TRANSACTION
 */
const creditWallet = async (userId, amount, options = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const validAmount = validateAmount(amount);
    
    const {
      description = 'Wallet credit',
      referenceType = 'other',
      referenceId = null,
      reference = null,
      idempotencyKey = null,
      metadata = {},
      ipAddress = null,
      userAgent = null
    } = options;
    
    // Check idempotency
    const idemKey = idempotencyKey || generateIdempotencyKey(userId, 'credit', validAmount);
    const existingTx = await WalletTransaction.findOne({ idempotencyKey: idemKey }).session(session);
    if (existingTx) {
      await session.abortTransaction();
      return { wallet: await Wallet.findOne({ user: userId }), transaction: existingTx, isDuplicate: true };
    }
    
    // Get wallet with lock
    const wallet = await getOrCreateWallet(userId);
    const walletDoc = await Wallet.findOneAndUpdate(
      { _id: wallet._id },
      {
        $inc: { balance: validAmount },
        $set: { lastActivityAt: new Date() }
      },
      { new: true, session }
    );
    
    // Create transaction record
    const transaction = new WalletTransaction({
      wallet: wallet._id,
      user: userId,
      type: 'credit',
      amount: validAmount,
      description: description.substring(0, 500),
      reference,
      referenceType,
      referenceId,
      status: 'completed',
      balanceBefore: wallet.balance,
      balanceAfter: walletDoc.balance,
      idempotencyKey: idemKey,
      metadata,
      ipAddress,
      userAgent
    });
    
    await transaction.save({ session });
    
    // Update user's embedded wallet for backward compatibility
    await User.findByIdAndUpdate(
      userId,
      { $set: { 'wallet.cash': walletDoc.balance } },
      { session }
    );
    
    await session.commitTransaction();
    
    // Invalidate cache
    await delAsync(`wallet:balance:${userId}`);
    
    console.log(`[Wallet] Credited ${validAmount} to user ${userId}. New balance: ${walletDoc.balance}`);
    
    return { wallet: walletDoc, transaction, isDuplicate: false };
  } catch (error) {
    await session.abortTransaction();
    console.error('[Wallet] Error crediting wallet:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Debit wallet (remove money) - SECURE TRANSACTION
 */
const debitWallet = async (userId, amount, options = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const validAmount = validateAmount(amount);
    
    const {
      description = 'Wallet debit',
      referenceType = 'other',
      referenceId = null,
      reference = null,
      idempotencyKey = null,
      metadata = {},
      ipAddress = null,
      userAgent = null,
      allowNegative = false
    } = options;
    
    // Check idempotency
    const idemKey = idempotencyKey || generateIdempotencyKey(userId, 'debit', validAmount);
    const existingTx = await WalletTransaction.findOne({ idempotencyKey: idemKey }).session(session);
    if (existingTx) {
      await session.abortTransaction();
      return { wallet: await Wallet.findOne({ user: userId }), transaction: existingTx, isDuplicate: true };
    }
    
    // Get wallet
    const wallet = await getOrCreateWallet(userId);
    
    // Check balance (with atomic verification)
    if (!allowNegative && wallet.balance < validAmount) {
      throw new Error(`Insufficient balance. Required: ${validAmount}, Available: ${wallet.balance}`);
    }
    
    // Check if wallet is locked
    if (wallet.isLocked) {
      throw new Error('Wallet is locked. Please contact support.');
    }
    
    // Atomic debit with balance check
    const walletDoc = await Wallet.findOneAndUpdate(
      {
        _id: wallet._id,
        balance: { $gte: allowNegative ? -Infinity : validAmount }
      },
      {
        $inc: { balance: -validAmount },
        $set: { lastActivityAt: new Date() }
      },
      { new: true, session }
    );
    
    if (!walletDoc) {
      throw new Error('Insufficient balance or concurrent modification');
    }
    
    // Create transaction record
    const transaction = new WalletTransaction({
      wallet: wallet._id,
      user: userId,
      type: 'debit',
      amount: validAmount,
      description: description.substring(0, 500),
      reference,
      referenceType,
      referenceId,
      status: 'completed',
      balanceBefore: wallet.balance,
      balanceAfter: walletDoc.balance,
      idempotencyKey: idemKey,
      metadata,
      ipAddress,
      userAgent
    });
    
    await transaction.save({ session });
    
    // Update user's embedded wallet for backward compatibility
    await User.findByIdAndUpdate(
      userId,
      { $set: { 'wallet.cash': walletDoc.balance } },
      { session }
    );
    
    await session.commitTransaction();
    
    // Invalidate cache
    await delAsync(`wallet:balance:${userId}`);
    
    console.log(`[Wallet] Debited ${validAmount} from user ${userId}. New balance: ${walletDoc.balance}`);
    
    return { wallet: walletDoc, transaction, isDuplicate: false };
  } catch (error) {
    await session.abortTransaction();
    console.error('[Wallet] Error debiting wallet:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Transfer between wallets - SECURE TRANSACTION
 */
const transfer = async (fromUserId, toUserId, amount, options = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const validAmount = validateAmount(amount);
    const { description = 'Wallet transfer', metadata = {} } = options;
    
    // Debit from sender
    const fromWallet = await getOrCreateWallet(fromUserId);
    if (fromWallet.balance < validAmount) {
      throw new Error('Insufficient balance');
    }
    
    // Debit
    const debitResult = await Wallet.findOneAndUpdate(
      { _id: fromWallet._id, balance: { $gte: validAmount } },
      { $inc: { balance: -validAmount }, $set: { lastActivityAt: new Date() } },
      { new: true, session }
    );
    
    if (!debitResult) {
      throw new Error('Debit failed');
    }
    
    // Credit recipient
    const toWallet = await getOrCreateWallet(toUserId);
    await Wallet.findByIdAndUpdate(
      toWallet._id,
      { $inc: { balance: validAmount }, $set: { lastActivityAt: new Date() } },
      { session }
    );
    
    // Create transaction records
    const debitTx = new WalletTransaction({
      wallet: fromWallet._id,
      user: fromUserId,
      type: 'debit',
      amount: validAmount,
      description: `Transfer to ${toUserId}: ${description}`,
      referenceType: 'transfer',
      referenceId: toUserId,
      status: 'completed',
      balanceBefore: fromWallet.balance,
      balanceAfter: debitResult.balance,
      metadata: { ...metadata, transferType: 'sent', recipientId: toUserId }
    });
    
    const creditTx = new WalletTransaction({
      wallet: toWallet._id,
      user: toUserId,
      type: 'credit',
      amount: validAmount,
      description: `Transfer from ${fromUserId}: ${description}`,
      referenceType: 'transfer',
      referenceId: fromUserId,
      status: 'completed',
      balanceBefore: toWallet.balance,
      balanceAfter: toWallet.balance + validAmount,
      metadata: { ...metadata, transferType: 'received', senderId: fromUserId }
    });
    
    await Promise.all([
      debitTx.save({ session }),
      creditTx.save({ session })
    ]);
    
    // Update embedded wallets
    await Promise.all([
      User.findByIdAndUpdate(fromUserId, { $set: { 'wallet.cash': debitResult.balance } }, { session }),
      User.findByIdAndUpdate(toUserId, { $inc: { 'wallet.cash': validAmount } }, { session })
    ]);
    
    await session.commitTransaction();
    
    // Invalidate caches
    await Promise.all([
      delAsync(`wallet:balance:${fromUserId}`),
      delAsync(`wallet:balance:${toUserId}`)
    ]);
    
    return { success: true, debitTransaction: debitTx, creditTransaction: creditTx };
  } catch (error) {
    await session.abortTransaction();
    console.error('[Wallet] Error in transfer:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Get transaction history
 */
const getTransactionHistory = async (userId, options = {}) => {
  try {
    return WalletTransaction.getForUser(userId, options);
  } catch (error) {
    console.error('[Wallet] Error getting transaction history:', error);
    throw error;
  }
};

/**
 * Verify wallet balance integrity
 */
const verifyBalanceIntegrity = async (userId) => {
  try {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return { verified: true, balance: 0, calculatedBalance: 0 };
    
    const calculatedBalance = await WalletTransaction.calculateBalance(userId);
    const isMatch = Math.abs(wallet.balance - calculatedBalance) < 0.01;
    
    return {
      verified: isMatch,
      balance: wallet.balance,
      calculatedBalance,
      discrepancy: wallet.balance - calculatedBalance
    };
  } catch (error) {
    console.error('[Wallet] Error verifying balance:', error);
    throw error;
  }
};

/**
 * Lock wallet (admin function)
 */
const lockWallet = async (userId, reason, adminId) => {
  try {
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          isLocked: true,
          lockedAt: new Date(),
          lockedReason: reason
        }
      },
      { new: true }
    );
    
    await delAsync(`wallet:balance:${userId}`);
    
    return wallet;
  } catch (error) {
    console.error('[Wallet] Error locking wallet:', error);
    throw error;
  }
};

/**
 * Unlock wallet (admin function)
 */
const unlockWallet = async (userId, adminId) => {
  try {
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          isLocked: false,
          lockedAt: null,
          lockedReason: null
        }
      },
      { new: true }
    );
    
    await delAsync(`wallet:balance:${userId}`);
    
    return wallet;
  } catch (error) {
    console.error('[Wallet] Error unlocking wallet:', error);
    throw error;
  }
};

module.exports = {
  getOrCreateWallet,
  getBalance,
  creditWallet,
  debitWallet,
  transfer,
  getTransactionHistory,
  verifyBalanceIntegrity,
  lockWallet,
  unlockWallet
};
