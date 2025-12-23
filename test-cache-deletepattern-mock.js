const CacheUtils = require('./modules/products/cacheUtils');

async function* fakeScanIterator({ MATCH, COUNT }) {
  // Simulate 250 keys returned in chunks
  for (let i = 0; i < 250; i++) {
    yield `${MATCH.replace('*','')}${i}`;
  }
}

(async () => {
  let deleted = [];
  const mockRedis = {
    isOpen: true,
    scanIterator: fakeScanIterator,
    del: async (...keys) => {
      deleted.push(...keys);
      return keys.length;
    }
  };

  const cache = new CacheUtils(mockRedis);
  await cache.deletePattern('products:search:*');

  console.log('Deleted count:', deleted.length);
})();