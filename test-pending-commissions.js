const redis = require("redis");

let isRedisConnected = false;

const client = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    keepAlive: 5000,
    reconnectStrategy(retries) {
      if (retries > 10) {
        return new Error("Max retries reached, Redis connection failed.");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

client.on("connect", () => console.log("Redis: connecting..."));
client.on("ready", () => {
  isRedisConnected = true;
  console.log("Redis: ready");
});
client.on("end", () => {
  isRedisConnected = false;
  console.warn("Redis: connection ended");
});
client.on("error", (err) => {
  isRedisConnected = false;
  console.error("Redis Client Error:", err.message);
});

let connectingPromise = null;

async function connectRedis() {
  if (client.isOpen) {
    isRedisConnected = true;
    return;
  }
  if (connectingPromise) {
    return connectingPromise;
  }

  console.log("Attempting to connect to Redis...");
  connectingPromise = client
    .connect()
    .then(() => {
      isRedisConnected = true;
      console.log("Redis connected successfully.");
    })
    .catch((err) => {
      isRedisConnected = false;
      console.error(`Failed to connect to Redis: ${err.message}`);
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

function getRedisClient() {
  return client;
}

function isRedisAvailable() {
  return isRedisConnected && client.isOpen;
}

/**
 * Safely delete keys (single key string or array of keys). Won't throw if client closed.
 * @param {string|string[]} keys
 */
async function safeDel(keys) {
  if (!isRedisAvailable()) return;
  try {
    if (!keys) return;
    if (typeof keys === "string") {
      await client.del(keys);
      return;
    }
    if (Array.isArray(keys) && keys.length) {
      await client.del(...keys);
    }
  } catch (err) {
    console.warn("safeDel failed:", err.message);
  }
}


async function zAddSafe(key, score, value, ttlSec) {
  if (!isRedisAvailable()) return false;
  
  try {
    await client.zAdd(key, { score, value });
    if (ttlSec) await client.expire(key, ttlSec);
    return true;
  } catch (err) {
    console.warn(`zAddSafe failed for key "${key}":`, err.message);
    return false;
  }
}

/**
 * Safely get cardinality of sorted set
 */
async function zCardSafe(key) {
  if (!isRedisAvailable()) return 0;
  try {
    return await client.zCard(key);
  } catch (err) {
    console.warn(`zCardSafe failed for key "${key}":`, err.message);
    return 0;
  }
}

async function zRemRangeByScoreSafe(key, min, max) {
  if (!isRedisAvailable()) return 0;
  try {
    return await client.zRemRangeByScore(key, min, max);
  } catch (err) {
    console.warn(`zRemRangeByScoreSafe failed for key "${key}":`, err.message);
    return 0;
  }
}

module.exports = client;
module.exports.connectRedis = connectRedis;
module.exports.isRedisAvailable = isRedisAvailable;
module.exports.getRedisClient = getRedisClient;
module.exports.safeDel = safeDel;
module.exports.zAddSafe = zAddSafe;
module.exports.zCardSafe = zCardSafe;
module.exports.zRemRangeByScoreSafe = zRemRangeByScoreSafe;

// Promisified Redis operations
// const getAsync = async (key) => {
//   if (!isRedisAvailable()) return null;
//   try {
//     return await client.get(key);
//   } catch (err) {
//     console.warn(`Redis get failed for key "${key}":`, err.message);
//     return null;
//   }
// };

// const setAsync = async (key, value, ttl) => {
//   if (!isRedisAvailable()) return false;
//   try {
//     if (ttl) {
//       await client.setEx(key, ttl, value);
//     } else {
//       await client.set(key, value);
//     }
//     return true;
//   } catch (err) {
//     console.warn(`Redis set failed for key "${key}":`, err.message);
//     return false;
//   }
// };

// const delAsync = async (key) => {
//   if (!isRedisAvailable()) return 0;
//   try {
//     return await client.del(key);
//   } catch (err) {
//     console.warn(`Redis del failed for key "${key}":`, err.message);
//     return 0;
//   }
// };

// module.exports.getAsync = getAsync;
// module.exports.setAsync = setAsync;
// module.exports.delAsync = delAsync;
