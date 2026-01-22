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
  if (connectingPromise) return connectingPromise;

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

async function safeDel(keys) {
  if (!isRedisAvailable()) return 0;

  try {
    if (!keys) return 0;

    if (typeof keys === "string") {
      return await client.del(keys);
    }

    if (Array.isArray(keys) && keys.length) {
      return await client.del(...keys);
    }

    return 0;
  } catch (err) {
    console.warn("safeDel failed:", err.message);
    return 0;
  }
}


async function safeDelPattern(pattern, { batchSize = 500, useUnlink = true } = {}) {
  if (!pattern || typeof pattern !== "string") return 0;
  if (!client?.isOpen) return 0;

  const fn =
    useUnlink && typeof client.unlink === "function"
      ? client.unlink.bind(client)
      : client.del.bind(client);

  let deleted = 0;
  let batch = [];

  try {
    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: batchSize })) {
      batch.push(key);

      if (batch.length >= batchSize) {
        deleted += await fn(...batch).catch(() => 0);
        batch = [];
      }
    }

    if (batch.length) {
      deleted += await fn(...batch).catch(() => 0);
    }

    return deleted;
  } catch (err) {
    console.warn(`safeDelPattern failed for "${pattern}":`, err?.message || err);
    return deleted;
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

const getAsync = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    return await client.get(key);
  } catch (err) {
    console.warn(`Redis get failed for key "${key}":`, err.message);
    return null;
  }
};

const setAsync = async (key, value, ...args) => {
  if (!isRedisAvailable()) return false;

  try {
    if (args.length === 2 && args[0] === "EX") {
      await client.setEx(key, args[1], value);
    } else if (args.length === 1 && typeof args[0] === "number") {
      await client.setEx(key, args[0], value);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (err) {
    console.warn(`Redis set failed for key "${key}":`, err.message);
    return false;
  }
};

const delAsync = async (key) => {
  if (!isRedisAvailable()) return 0;
  try {
    return await client.del(key);
  } catch (err) {
    console.warn(`Redis del failed for key "${key}":`, err.message);
    return 0;
  }
};

module.exports = client;
module.exports.connectRedis = connectRedis;
module.exports.isRedisAvailable = isRedisAvailable;
module.exports.getRedisClient = getRedisClient;
module.exports.safeDel = safeDel;
module.exports.safeDelPattern = safeDelPattern;
module.exports.zAddSafe = zAddSafe;
module.exports.zCardSafe = zCardSafe;
module.exports.zRemRangeByScoreSafe = zRemRangeByScoreSafe;
module.exports.getAsync = getAsync;
module.exports.setAsync = setAsync;
module.exports.delAsync = delAsync;
