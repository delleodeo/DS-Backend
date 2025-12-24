// Integration tests for removeVariant using a real MongoDB instance
// These tests mock Cloudinary module but run real DB operations

jest.setTimeout(30000);

// Mock upload service BEFORE requiring the service module
const mockDeleteResult = { successful: 1, failed: 0, total: 1 };
const mockExtractPublicId = (url) => {
  // Simple extractor for test urls containing 'public' or returning null when absent
  if (!url) return null;
  const match = url.match(/public-?([a-z0-9-]+)/i);
  if (match) return match[1];
  return 'pub1';
};

jest.mock('../../modules/upload/upload.service.js', () => ({
  deleteBatchFromCloudinary: jest.fn().mockResolvedValue(mockDeleteResult),
  safeDeleteBatch: jest.fn().mockResolvedValue(mockDeleteResult),
  extractPublicIdFromUrl: jest.fn((u) => mockExtractPublicId(u)),
  // Provide a minimal uploadTemp that resembles multer's API used by admin routes
  uploadTemp: {
    single: () => (req, res, next) => next(),
    fields: () => (req, res, next) => next(),
    array: () => (req, res, next) => next()
  },
  uploadPermanent: {
    array: () => (req, res, next) => next()
  },
  uploadDocuments: {
    fields: () => (req, res, next) => next(),
    single: () => (req, res, next) => next()
  },
  // Handlers expected by routes
  tempUploadHandler: (req, res, next) => next(),
  permanentUploadHandler: (req, res, next) => next(),
  documentUploadHandler: (req, res, next) => next(),
}));

const mongoose = require('mongoose');
const Product = require('../../modules/products/products.model');
const service = require('../../modules/products/products.service');
const supertest = require('supertest');

// Mock auth middleware to bypass protect for tests
jest.mock('../../auth/auth.controller.js', () => ({
  protect: (req, res, next) => {
    // Use a stable string id to avoid referencing out-of-scope variables in jest.mock factories
    req.user = { id: 'integration-admin-id', role: 'admin' };
    return next();
  },
  // restrictTo returns middleware that allows the test to bypass role checks
  restrictTo: () => (req, res, next) => next()
}));

const app = require('../../app');
const request = supertest(app);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dshop-integration-test';

beforeAll(async () => {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
  try {
    await mongoose.connection.db.dropDatabase();
  } catch (err) {
    // Ignore permission errors during CI or restricted DB users
    console.warn('Could not drop test database:', err.message);
  }
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Product.deleteMany({});
  jest.clearAllMocks();
});

describe('removeVariant integration tests', () => {
  test('removing the only variant deletes the product and cleans images', async () => {
    // Arrange: create product with single option and image
    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Prod Single Option',
      municipality: 'SomeTown',
      price: 10,
      imageUrls: ['https://cdn.example.com/public-abc123.jpg'],
      option: [
        { label: 'Only', imageUrl: 'https://cdn.example.com/public-abc123.jpg', stock: 1, sold: 0, price: 10 }
      ],
    });

    await prod.save();

    // Act
    const res = await service.removeVariant(prod._id.toString(), prod.option[0]._id.toString());

    // Assert
    expect(res.deleted).toBe(true);
    const found = await Product.findById(prod._id);
    expect(found).toBeNull();

    const uploadService = require('../../modules/upload/upload.service.js');
    expect(uploadService.safeDeleteBatch).toHaveBeenCalled();
  });

  test('removing one variant among many removes variant, recalculates aggregates, and cleans its image', async () => {
    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Prod Multiple Options',
      municipality: 'SomeTown',
      price: 20,
      imageUrls: ['https://cdn.example.com/main.jpg'],
      option: [
        { label: 'A', imageUrl: 'https://cdn.example.com/public-aaa', stock: 2, sold: 0, price: 10 },
        { label: 'B', imageUrl: 'https://cdn.example.com/public-bbb', stock: 3, sold: 1, price: 10 }
      ],
    });

    await prod.save();

    const targetId = prod.option[0]._id.toString();
    const result = await service.removeVariant(prod._id.toString(), targetId);

    expect(result.deleted).toBe(false);
    expect(result.product).toBeDefined();
    const dbProduct = await Product.findById(prod._id);
    expect(dbProduct.option.length).toBe(1);
    expect(dbProduct.stock).toBe(3); // remaining option stock

    const uploadService = require('../../modules/upload/upload.service.js');
    expect(uploadService.safeDeleteBatch).toHaveBeenCalledWith(expect.any(Array));
  });

  test('Cloudinary deletion failure does not prevent variant removal (graceful handling)', async () => {
    const uploadService = require('../../modules/upload/upload.service.js');
    uploadService.safeDeleteBatch.mockRejectedValueOnce(new Error('Cloudinary error'));

    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Prod CloudFail',
      municipality: 'SomeTown',
      price: 8,
      option: [ { label: 'X', imageUrl: 'https://cdn.example.com/public-x', stock: 1, price: 8 } ]
    });

    await prod.save();

    // Should not throw despite Cloudinary failure
    const res = await service.removeVariant(prod._id.toString(), prod.option[0]._id.toString());
    expect(res.deleted).toBe(true);

    // verify product is removed
    const found = await Product.findById(prod._id);
    expect(found).toBeNull();
  });

  test('invalid variantId (non-objectid) throws 400', async () => {
    const prod = new Product({ vendorId: new mongoose.Types.ObjectId(), name: 'P', municipality: 'SomeTown', price: 5 });
    await prod.save();

    await expect(service.removeVariant(prod._id.toString(), 'temp-123')).rejects.toMatchObject({ status: 400 });
  });
});

// --- deleteProductService integration tests ---
describe('deleteProductService integration tests', () => {
  test('DELETE /v1/products/:id deletes product and triggers Cloudinary cleanup', async () => {
    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Product Delete',
      municipality: 'SomeTown',
      price: 12,
      imageUrls: ['https://cdn.example.com/public-delete123.jpg'],
      option: [{ label: 'A', imageUrl: 'https://cdn.example.com/public-delete123.jpg', stock: 1, price: 12 }]
    });

    await prod.save();

    const res = await request.delete(`/v1/products/${prod._id.toString()}`).expect(200);
    expect(res.body).toEqual({ message: 'Product deleted' });

    const found = await Product.findById(prod._id);
    expect(found).toBeNull();

    const uploadService = require('../../modules/upload/upload.service.js');
    // Allow duplicate values in the array if implementation returns them
    const calls = uploadService.deleteBatchFromCloudinary.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Check that at least one call contains 'delete123'
    expect(calls.some(call => Array.isArray(call[0]) && call[0].includes('delete123'))).toBe(true);
  });

  test('Cloudinary deletion failure is handled gracefully and product still deleted', async () => {
    const uploadService = require('../../modules/upload/upload.service.js');
    uploadService.deleteBatchFromCloudinary.mockRejectedValueOnce(new Error('Cloudinary error'));

    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Product Delete CloudFail',
      municipality: 'SomeTown',
      price: 15,
      imageUrls: ['https://cdn.example.com/public-fail123.jpg'],
      option: [{ label: 'A', imageUrl: 'https://cdn.example.com/public-fail123.jpg', stock: 1, price: 15 }]
    });

    await prod.save();

    const res = await request.delete(`/v1/products/${prod._id.toString()}`).expect(200);
    expect(res.body).toEqual({ message: 'Product deleted' });

    const found = await Product.findById(prod._id);
    expect(found).toBeNull();
  });

  test('extractPublicIdFromUrl throwing causes transaction rollback (product not deleted)', async () => {
    const uploadService = require('../../modules/upload/upload.service.js');
    uploadService.extractPublicIdFromUrl.mockImplementationOnce(() => { throw new Error('extract error'); });

    const prod = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Product Transaction Rollback',
      municipality: 'SomeTown',
      price: 10,
      imageUrls: ['https://cdn.example.com/public-rollback.jpg'],
      option: [{ label: 'A', imageUrl: 'https://cdn.example.com/public-rollback.jpg', stock: 1, price: 10 }]
    });

    await prod.save();

    // Since controller catches errors, we expect an HTTP 500
    const res = await request.delete(`/v1/products/${prod._id.toString()}`).expect(500);
    expect(res.body).toHaveProperty('error');

    // Product should still exist because transaction was aborted
    const found = await Product.findById(prod._id);
    expect(found).not.toBeNull();
  });

  test('invalid product id throws 400', async () => {
    const res = await request.delete(`/v1/products/invalid-id`).expect(400);
    expect(res.body).toHaveProperty('error');
  });
});
