const CacheUtils = require('./modules/products/cacheUtils');

async function run() {
  // Mock redis client
  const mockClient = {
    isOpen: true,
    _keys: ['products:approved:skip:0:limit:10', 'products:search:foo'],
    async del(...args) {
      console.log('mock del called with', args);
      // emulate deletion
      this._keys = this._keys.filter(k => !args.includes(k));
      return args.length;
    },
    async scan(cursor, opts) {
      // Simple single-pass mock: return all matching keys once
      const match = opts.MATCH;
      const matching = this._keys.filter(k => {
        const pattern = match.replace('*', '');
        return k.startsWith(pattern);
      });
      return ['0', matching];
    }
  };

  const cache = new CacheUtils(mockClient);

  console.log('Testing delete with string');
  await cache.delete('products:approved:skip:0:limit:10');

  console.log('Testing delete with array');
  await cache.delete(['products:search:foo']);

  console.log('Testing deletePattern');
  // repopulate keys
  mockClient._keys = ['products:approved:skip:0:limit:10', 'products:search:foo', 'products:search:bar'];
  await cache.deletePattern('products:search:*');
  console.log('Remaining keys', mockClient._keys);
}

run().catch(console.error);