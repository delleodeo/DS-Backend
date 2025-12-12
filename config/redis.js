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

module.exports = client;
module.exports.connectRedis = connectRedis;
module.exports.isRedisAvailable = isRedisAvailable;
module.exports.getRedisClient = getRedisClient;
