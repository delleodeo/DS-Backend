const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    // keep the TCP connection alive; value in ms
    keepAlive: 5000,
    // simple backoff to avoid rapid reconnect loops
    reconnectStrategy(retries) {
      // cap backoff at 2s
      return Math.min(retries * 50, 2000);
    },
  },
});

let connectingPromise = null;

client.on('connect', () => console.log('Redis: connecting...'));
client.on('ready', () => console.log('Redis: ready'));
client.on('end', () => console.warn('Redis: connection ended'));
client.on('error', (err) => console.error('Redis Client Error:', err));

async function connectRedis() {
  try {
    if (client.isOpen) return;
    if (!connectingPromise) {
      connectingPromise = client.connect().finally(() => {
        // allow future reconnect attempts if needed
        connectingPromise = null;
      });
    }
    await connectingPromise;
  } catch (err) {
    console.error('Failed to connect to Redis:', err?.message || err);
    throw err;
  }
}

module.exports = client;
module.exports.connectRedis = connectRedis;
