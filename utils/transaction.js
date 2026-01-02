const mongoose = require('mongoose');

const withTransaction = async (operations, options = {}) => {
  let session;

  try {
    session = await mongoose.startSession();

    try {
      // Try to start a transaction; on standalone Mongo this may throw
      session.startTransaction(options);
    } catch (err) {
      // Transactions not supported (likely standalone mongod) — fall back to no-session execution
      await session.endSession();
      return await operations(null);
    }

    try {
      const result = await operations(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    // If we could not start a session at all, fall back gracefully
    return await operations(null);
  }
};

const withRetry = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if it's a transient error that should be retried
      const isTransientError = error.name === 'TransientTransactionError' ||
                               error.message.includes('WriteConflict') ||
                               error.code === 112; // WriteConflict

      if (!isTransientError || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
};

module.exports = {
  withTransaction,
  withRetry,
};