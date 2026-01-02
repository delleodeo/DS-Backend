// Ensure modules that should be mocked are mocked before requiring them
jest.mock('../modules/products/products.model');
jest.mock('../modules/products/product-utils/productUtils');
jest.mock('../modules/products/product-utils/cacheUtils');

const Product = require('../modules/products/products.model');
const productUtils = require('../modules/products/product-utils/productUtils');
const CacheUtils = require('../modules/products/product-utils/cacheUtils');

// Import the service after mocks are set up
const service = require('../modules/products/products.service');

// Provide a mock CacheUtils implementation used by the service
CacheUtils.mockImplementation(() => ({
  get: jest.fn().mockResolvedValue(null),
  isAvailable: jest.fn().mockReturnValue(false),
  set: jest.fn(),
  delete: jest.fn(),
  deletePattern: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Ensure createError returns an Error object so service throws meaningful errors
  productUtils.createError.mockImplementation((msg, status = 500) => {
    const err = new Error(msg);
    err.status = status;
    return err;
  });
});

describe('products.service - addSingleOption', () => {
  const mongoose = require('mongoose');

  test('adds an option when product exists and no label conflict', async () => {
    // Arrange
    productUtils.isValidObjectId.mockReturnValue(true);
    productUtils.validateOptionPayload.mockReturnValue([]);
    productUtils.ensureMainImage.mockReturnValue(false);

    const fakeUpdated = { _id: 'p1', option: [{ label: 'A' }], vendorId: 'v1' };
    Product.findOneAndUpdate.mockResolvedValue(fakeUpdated);

    // Act
    const res = await service.addSingleOption('507f1f77bcf86cd799439011', { price: 10 });

    // Assert
    expect(Product.findOneAndUpdate).toHaveBeenCalled();
    expect(res).toEqual(fakeUpdated);
  });

  test('throws 409 when label is duplicate', async () => {
    productUtils.isValidObjectId.mockReturnValue(true);
    productUtils.validateOptionPayload.mockReturnValue([]);

    // Simulate findOneAndUpdate returning null (no insert because label conflict)
    Product.findOneAndUpdate.mockResolvedValue(null);

    // Mock mongoose startSession to avoid real DB sessions and provide a fake session
    const fakeSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    };
    mongoose.startSession = jest.fn().mockResolvedValue(fakeSession);

    // Product.findById should return a query-like object with .session() that resolves to the product
    Product.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: 'p1', option: [{ label: 'SAME' }], vendorId: 'v1', save: jest.fn() }) });

    await expect(
      service.addSingleOption('507f1f77bcf86cd799439011', { label: 'SAME' })
    ).rejects.toMatchObject({ message: 'Option with this label already exists for this product', status: 409 });

    // Should not proceed to update when label already exists
    expect(Product.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('throws 400 for invalid productId', async () => {
    productUtils.isValidObjectId.mockReturnValue(false);

    await expect(service.addSingleOption('bad-id', { price: 1 })).rejects.toMatchObject({ message: 'Invalid product ID', status: 400 });
  });
});

describe('products.service - searchProductsService', () => {
  test('throws 400 for empty query', async () => {
    await expect(service.searchProductsService('')).rejects.toMatchObject({ message: 'Search query must be a non-empty string', status: 400 });
  });

  test('throws 400 for too long query', async () => {
    const long = 'a'.repeat(300);
    await expect(service.searchProductsService(long)).rejects.toMatchObject({ message: 'Search query too long', status: 400 });
  });

  test('returns paginated results for valid query', async () => {
    productUtils.buildSearchQuery.mockReturnValue({ name: /term/i });
    // sanitizePagination is a mock from productUtils; ensure it returns sensible pagination values
    productUtils.sanitizePagination.mockReturnValue({ limit: 10, skip: 0 });

    // Mock chainable Mongoose query helpers
    Product.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'p1' }])
    });

    const res = await service.searchProductsService('term', 10, 0);
    expect(Product.find).toHaveBeenCalled();
    expect(res).toEqual([{ _id: 'p1' }]);
  });
});
