const CircuitBreaker = require('opossum');
const logger = require('../utils/logger');
const { ExternalServiceError, DatabaseError } = require('../utils/errorHandler');

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

/**
 * Circuit breaker configuration
 */
const CIRCUIT_CONFIG = {
  timeout: 3000, // 3 seconds
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // 30 seconds
  rollingCountTimeout: 10000, // 10 seconds
  rollingCountBuckets: 10
};

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
const calculateDelay = (attempt, baseDelay = RETRY_CONFIG.baseDelay, maxDelay = RETRY_CONFIG.maxDelay) => {
  const delay = baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, maxDelay);
};

/**
 * Retry function with exponential backoff
 */
const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxAttempts = RETRY_CONFIG.maxAttempts,
    baseDelay = RETRY_CONFIG.baseDelay,
    maxDelay = RETRY_CONFIG.maxDelay,
    retryCondition = () => true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxAttempts || !retryCondition(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, baseDelay, maxDelay);

      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, {
        error: error.message,
        attempt,
        maxAttempts
      });

      if (onRetry) {
        onRetry(error, attempt);
      }

      await sleep(delay);
    }
  }

  throw lastError;
};

/**
 * Database operation with retry
 */
const withDatabaseRetry = (operation) => {
  return retryWithBackoff(operation, {
    maxAttempts: 3,
    retryCondition: (error) => {
      // Retry on connection errors, timeouts, but not on validation errors
      return error.name !== 'ValidationError' &&
             error.name !== 'CastError' &&
             !error.message.includes('validation');
    },
    onRetry: (error, attempt) => {
      logger.warn(`Database operation failed (attempt ${attempt}):`, error.message);
    }
  });
};

/**
 * External service call with retry
 */
const withExternalServiceRetry = (operation, serviceName) => {
  return retryWithBackoff(operation, {
    maxAttempts: 3,
    retryCondition: (error) => {
      // Retry on network errors, timeouts, 5xx errors
      return error.code === 'ECONNREFUSED' ||
             error.code === 'ETIMEDOUT' ||
             error.code === 'ENOTFOUND' ||
             (error.response && error.response.status >= 500);
    },
    onRetry: (error, attempt) => {
      logger.warn(`${serviceName} call failed (attempt ${attempt}):`, error.message);
    }
  });
};

/**
 * Circuit breaker for external services
 */
const createCircuitBreaker = (serviceName, operation) => {
  const breaker = new CircuitBreaker(operation, CIRCUIT_CONFIG);

  // Event handlers
  breaker.on('open', () => {
    logger.error(`${serviceName} circuit breaker opened`);
  });

  breaker.on('close', () => {
    logger.info(`${serviceName} circuit breaker closed`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`${serviceName} circuit breaker half-open`);
  });

  breaker.on('fallback', (error) => {
    logger.warn(`${serviceName} circuit breaker fallback triggered:`, error.message);
  });

  // Fallback function
  breaker.fallback(() => {
    throw new ExternalServiceError(serviceName, 'Service temporarily unavailable');
  });

  return breaker;
};

/**
 * Idempotency key generator and validator
 */
class IdempotencyManager {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.keyPrefix = 'idempotency:';
    this.ttl = 24 * 60 * 60; // 24 hours
  }

  /**
   * Generate idempotency key
   */
  generateKey(userId, operation, resourceId) {
    return `${this.keyPrefix}${userId}:${operation}:${resourceId}`;
  }

  /**
   * Check if operation is already in progress or completed
   */
  async checkAndSet(key, ttl = this.ttl) {
    if (!this.redisClient || !this.redisClient.isOpen) {
      // Fallback to in-memory store (not recommended for production)
      logger.warn('Redis not available for idempotency checks');
      return true;
    }

    try {
      const exists = await this.redisClient.set(key, 'processing', {
        NX: true,
        EX: ttl
      });

      return exists === 'OK';
    } catch (error) {
      logger.warn('Idempotency check failed:', error);
      return true; // Allow operation if check fails
    }
  }

  /**
   * Mark operation as completed
   */
  async markCompleted(key, result = 'completed') {
    if (!this.redisClient || !this.redisClient.isOpen) return;

    try {
      await this.redisClient.setEx(key, this.ttl, result);
    } catch (error) {
      logger.warn('Failed to mark operation as completed:', error);
    }
  }

  /**
   * Clear idempotency key
   */
  async clear(key) {
    if (!this.redisClient || !this.redisClient.isOpen) return;

    try {
      await this.redisClient.del(key);
    } catch (error) {
      logger.warn('Failed to clear idempotency key:', error);
    }
  }
}

/**
 * Atomic operation wrapper with optimistic concurrency control
 */
const withOptimisticLocking = async (model, id, updateFn, maxRetries = 3) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      // Get current version
      const document = await model.findById(id);
      if (!document) {
        throw new Error('Document not found');
      }

      const currentVersion = document.__v || 0;

      // Apply updates
      const updatedData = await updateFn(document);

      // Attempt update with version check
      const result = await model.findOneAndUpdate(
        { _id: id, __v: currentVersion },
        { ...updatedData, __v: currentVersion + 1 },
        { new: true, runValidators: true }
      );

      if (!result) {
        if (attempts === maxRetries - 1) {
          throw new Error('Concurrent modification detected, please retry');
        }
        attempts++;
        continue;
      }

      return result;
    } catch (error) {
      if (error.message.includes('Concurrent modification') && attempts < maxRetries - 1) {
        attempts++;
        await sleep(calculateDelay(attempts));
        continue;
      }
      throw error;
    }
  }
};

/**
 * Batch operation with error classification
 */
const executeBatchOperation = async (operations) => {
  const results = await Promise.allSettled(operations);

  const successful = [];
  const failed = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push({
        index,
        error: result.reason,
        isCritical: isCriticalError(result.reason)
      });
    }
  });

  // Log failures
  failed.forEach(({ index, error, isCritical }) => {
    const level = isCritical ? 'error' : 'warn';
    logger[level](`Batch operation ${index} failed:`, error.message);
  });

  return { successful, failed };
};

/**
 * Determine if an error is critical
 */
const isCriticalError = (error) => {
  // Critical errors that should fail the entire operation
  const criticalPatterns = [
    'authentication',
    'authorization',
    'validation',
    'not found',
    'forbidden'
  ];

  const message = error.message.toLowerCase();
  return criticalPatterns.some(pattern => message.includes(pattern));
};

module.exports = {
  retryWithBackoff,
  withDatabaseRetry,
  withExternalServiceRetry,
  createCircuitBreaker,
  IdempotencyManager,
  withOptimisticLocking,
  executeBatchOperation,
  isCriticalError,
  RETRY_CONFIG,
  CIRCUIT_CONFIG
};