const { getProductByIdService, addSingleOption } = require('../modules/products/products.service');

describe('Products Service - ID validation', () => {
  test('getProductByIdService throws 400 for invalid ID', async () => {
    await expect(getProductByIdService('not-an-object-id')).rejects.toThrow('Invalid product ID');
  });

  test('addSingleOption throws 400 for invalid product ID', async () => {
    await expect(addSingleOption('not-an-id', { price: 10 })).rejects.toThrow('Invalid product ID');
  });

  test.todo('addSingleOption should prevent duplicate labels under concurrency (simulate transaction conflict)');
});
