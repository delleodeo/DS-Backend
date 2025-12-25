const { default: Redlock } = require('redlock');
const { getRedisClient, isRedisAvailable } = require('../config/redis');

let redlock = null;

const initializeRedlock = () => {
  if (!redlock && isRedisAvailable()) {
    const redisClient = getRedisClient();
    redlock = new Redlock([redisClient], {
      driftFactor: 0.01, // Time drift factor
      retryCount: 3, // Number of retries
      retryDelay: 200, // Delay between retries in ms
      retryJitter: 50, // Random jitter to avoid thundering herd
      automaticExtensionThreshold: 500, // Extend lock if TTL is below this
    });

    redlock.on('error', (err) => {
      console.error('Redlock error:', err);
    });
  }
  return redlock;
};

const acquireLock = async (resource, ttl = 5000) => {
  const redlockInstance = initializeRedlock();
  try {
    return await redlockInstance.acquire([resource], ttl);
  } catch (err) {
    throw new Error(`Failed to acquire lock for ${resource}: ${err.message}`);
  }
};

const withLock = async (resource, operation, ttl = 5000) => {
  if (!isRedisAvailable()) {
    console.warn(`Redis not available, skipping lock for resource: ${resource}`);
    return await operation();
  }

  const redlockInstance = initializeRedlock();
  
  return redlockInstance.using([resource], ttl, async (signal) => {
    if (signal.aborted) {
      throw signal.error;
    }
    
    const result = await operation();
    return result;
  });
};

module.exports = {
  initializeRedlock,
  acquireLock,
  withLock,
};