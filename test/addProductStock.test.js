const Product = require('../modules/products/products.model');
const productUtils = require('../modules/products/product-utils/productUtils');

const service = require('../modules/products/products.service');

jest.mock('../modules/products/products.model');
jest.mock('../modules/products/product-utils/productUtils');

beforeEach(() => {
  jest.clearAllMocks();
  // Ensure createError returns an Error object for tests
  productUtils.createError.mockImplementation((msg, status = 500) => {
    const e = new Error(msg);
    e.status = status;
    return e;
  });
});

describe('addProductStock', () => {
  test('updates option stock when optionId provided and sufficient stock', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    const updatedDoc = { _id: 'p1', option: [{ _id: 'o1', stock: 5 }], vendorId: 'v1' };
    Product.findOneAndUpdate.mockResolvedValue(updatedDoc);

    const res = await service.addProductStock('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', 2);

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', 'option._id': '507f1f77bcf86cd799439012', 'option.stock': { $gte: -2 } },
      { $inc: { 'option.$.stock': 2 } },
      { new: true, runValidators: true, context: 'query' }
    );
    expect(res).toEqual(updatedDoc);
  });

  test('throws 404 when option update fails due to insufficient stock or missing option', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    Product.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.addProductStock('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099', -1000)
    ).rejects.toMatchObject({ message: 'Product or option not found or insufficient stock', status: 404 });
  });

  test('updates main stock when no optionId provided', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    const updated = { _id: 'p2', stock: 10, vendorId: 'v2' };
    Product.findOneAndUpdate.mockResolvedValue(updated);

    const res = await service.addProductStock('507f1f77bcf86cd799439011', null, 5);

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', stock: { $gte: -5 } },
      { $inc: { stock: 5 } },
      { new: true }
    );
    expect(res).toEqual(updated);
  });

  test('throws 404 when main stock update fails (insufficient)', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    Product.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.addProductStock('507f1f77bcf86cd799439011', null, -1000)
    ).rejects.toMatchObject({ message: 'Product not found or insufficient stock', status: 404 });
  });

  test('throws 400 for invalid product id', async () => {
    productUtils.isValidObjectId.mockReturnValue(false);
    await expect(service.addProductStock('bad-id', null, 1)).rejects.toMatchObject({ message: 'Invalid product ID', status: 400 });
  });

  test('throws 400 for non-number addition', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    await expect(service.addProductStock('507f1f77bcf86cd799439011', null, 'x')).rejects.toMatchObject({ message: 'Addition value must be a number', status: 400 });
  });
});
