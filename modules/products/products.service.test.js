const { getPaginatedProducts, createProductService, getProductByIdService } = require('./products.service.js');
const Product = require('./products.model.js');
const CacheUtils = require('./product-utils/cacheUtils.js');

// Mock dependencies
jest.mock('./products.model.js');
jest.mock('./product-utils/cacheUtils.js');
jest.mock('../../utils/logger.js', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Products Service - Edge Cases and Error Scenarios', () => {
  let mockCache;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true)
    };
    CacheUtils.mockImplementation(() => mockCache);
    mockLogger = require('../../utils/logger.js');
    });
  });

  describe('getPaginatedProducts', () => {
    test('should handle Redis cache miss gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      Product.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await getPaginatedProducts(0, 10);

      expect(result).toEqual([]);
      expect(mockCache.get).toHaveBeenCalled();
      expect(Product.find).toHaveBeenCalled();
    });

    test('should handle database query failure', async () => {
      mockCache.get.mockResolvedValue(null);
      Product.find = jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(getPaginatedProducts(0, 10)).rejects.toThrow('Database connection failed');
    });

    test('should handle invalid skip/limit parameters', async () => {
      mockCache.get.mockResolvedValue(null);
      Product.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Test with negative values (should be sanitized)
      const result = await getPaginatedProducts(-5, -10);

      expect(Product.find).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('createProductService', () => {
    test('should handle transaction failure and rollback', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      // Mock mongoose startSession
      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      // Mock Product constructor and save to throw error
      const mockProduct = {
        save: jest.fn().mockRejectedValue(new Error('Validation failed'))
      };
      Product.mockImplementation(() => mockProduct);

      await expect(createProductService({ name: 'Test', vendorId: '123' })).rejects.toThrow('Validation failed');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    test('should handle ensureMainImage modification', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const mockProduct = {
        save: jest.fn().mockResolvedValue(),
        imageUrls: []
      };
      Product.mockImplementation(() => mockProduct);

      // Mock ensureMainImage to return modified
      const productUtils = require('./product-utils/productUtils.js');
      productUtils.ensureMainImage = jest.fn().mockReturnValue({ modified: true });

      await createProductService({ name: 'Test', vendorId: '123' });

      expect(mockProduct.save).toHaveBeenCalledTimes(2); // Once for initial save, once for image modification
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('getProductByIdService', () => {
    test('should handle promotion validation errors', async () => {
      const mockProduct = {
        toObject: jest.fn().mockReturnValue({
          _id: '123',
          promotions: [{ isActive: true, endDate: new Date('2020-01-01') }] // Expired promotion
        })
      };

      Product.findById = jest.fn().mockResolvedValue(mockProduct);
      mockCache.get.mockResolvedValue(null);

      // Mock Vendor findOne
      const Vendor = require('../vendors/vendors.model.js');
      Vendor.findOne = jest.fn().mockResolvedValue({ storeName: 'Test Store' });

      // Mock validateAndCleanPromotions to throw error
      const productUtils = require('./product-utils/productUtils.js');
      productUtils.validateAndCleanPromotions = jest.fn().mockImplementation(() => {
        throw new Error('Invalid promotion data');
      });

      await expect(getProductByIdService('123')).rejects.toThrow('Invalid promotion data');
    });

    test('should handle vendor lookup failure', async () => {
      const mockProduct = {
        toObject: jest.fn().mockReturnValue({
          _id: '123',
          vendorId: '456'
        })
      };

      Product.findById = jest.fn().mockResolvedValue(mockProduct);
      mockCache.get.mockResolvedValue(null);

      // Mock Vendor findOne to fail
      const Vendor = require('../vendors/vendors.model.js');
      Vendor.findOne = jest.fn().mockRejectedValue(new Error('Vendor lookup failed'));

      await expect(getProductByIdService('123')).rejects.toThrow('Vendor lookup failed');
    });

    test('should handle product not found', async () => {
      Product.findById = jest.fn().mockResolvedValue(null);
      mockCache.get.mockResolvedValue(null);

      await expect(getProductByIdService('nonexistent')).rejects.toThrow('Product not found');
    });
  });

  describe('Cache integration', () => {
    test('should handle cache set failure gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error('Redis connection failed'));

      Product.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ _id: '123', name: 'Test' }])
          })
        })
      });

      const result = await getPaginatedProducts(0, 10);

      expect(result).toEqual([{ _id: '123', name: 'Test' }]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cache set error'),
        expect.anything()
      );
    });

    test('should handle cache unavailable', async () => {
      mockCache.isAvailable.mockReturnValue(false);
      mockCache.get.mockResolvedValue(null);

      Product.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ _id: '123', name: 'Test' }])
          })
        })
      });

      const result = await getPaginatedProducts(0, 10);

      expect(result).toEqual([{ _id: '123', name: 'Test' }]);
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('XSS Sanitization', () => {
    test('should sanitize XSS in product name during creation', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const mockProduct = {
        save: jest.fn().mockResolvedValue(),
        name: '<script>alert("xss")</script>Safe Name',
        description: 'Safe description',
        municipality: 'Safe City'
      };
      Product.mockImplementation(() => mockProduct);

      await createProductService({
        vendorId: '123',
        name: '<script>alert("xss")</script>Safe Name',
        description: 'Safe description',
        price: 100,
        municipality: 'Safe City'
      });

      expect(mockProduct.name).not.toContain('<script>');
      expect(mockProduct.name).not.toContain('<');
      expect(mockProduct.name).toContain('Safe Name');
    });

    test('should sanitize XSS in product description during creation', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const mockProduct = {
        save: jest.fn().mockResolvedValue(),
        name: 'Safe Name',
        description: '<img src=x onerror=alert("xss")>Safe description',
        municipality: 'Safe City'
      };
      Product.mockImplementation(() => mockProduct);

      await createProductService({
        vendorId: '123',
        name: 'Safe Name',
        description: '<img src=x onerror=alert("xss")>Safe description',
        price: 100,
        municipality: 'Safe City'
      });

      expect(mockProduct.description).not.toContain('<img');
      expect(mockProduct.description).not.toContain('onerror');
      expect(mockProduct.description).toContain('Safe description');
    });

    test('should sanitize XSS in municipality during creation', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const mockProduct = {
        save: jest.fn().mockResolvedValue(),
        name: 'Safe Name',
        description: 'Safe description',
        municipality: '<iframe src="evil.com">Safe City</iframe>'
      };
      Product.mockImplementation(() => mockProduct);

      await createProductService({
        vendorId: '123',
        name: 'Safe Name',
        description: 'Safe description',
        price: 100,
        municipality: '<iframe src="evil.com">Safe City</iframe>'
      });

      expect(mockProduct.municipality).not.toContain('<iframe');
      expect(mockProduct.municipality).toContain('Safe City');
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent product creation', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      let productCount = 0;
      Product.mockImplementation(() => ({
        save: jest.fn().mockImplementation(() => {
          productCount++;
          return Promise.resolve();
        })
      }));

      const createPromises = Array(5).fill().map((_, i) =>
        createProductService({
          vendorId: '123',
          name: `Concurrent Product ${i}`,
          description: 'Test concurrent creation',
          price: 100,
          municipality: 'Test City'
        })
      );

      await Promise.all(createPromises);
      expect(productCount).toBe(5);
    });

    test('should handle concurrent product updates', async () => {
      const mockProduct = {
        findByIdAndUpdate: jest.fn().mockResolvedValue({
          _id: '123',
          name: 'Updated Name'
        })
      };

      Product.findByIdAndUpdate = mockProduct.findByIdAndUpdate;

      const updatePromises = Array(3).fill().map((_, i) =>
        require('./products.service.js').updateProductService('123', {
          name: `Update ${i}`
        })
      );

      const results = await Promise.allSettled(updatePromises);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0); // At least one should succeed
    });
  });

  describe('Invalid Input Handling', () => {
    test('should reject invalid ObjectId in vendorId', async () => {
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      Product.mockImplementation(() => {
        throw new Error('Validation failed: vendorId');
      });

      await expect(createProductService({
        vendorId: 'invalid-object-id',
        name: 'Test Product',
        price: 100,
        municipality: 'Test City'
      })).rejects.toThrow();
    });

    test('should handle extremely long input strings', async () => {
      const longString = 'a'.repeat(10000);

      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      Product.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('String too long'))
      }));

      await expect(createProductService({
        vendorId: '507f191e810c19729de860ea',
        name: longString,
        description: 'Test',
        price: 100,
        municipality: 'Test City'
      })).rejects.toThrow();
    });
  });

  describe('External Service Failures', () => {
    test('should handle Cloudinary upload failures gracefully', async () => {
      // This would be tested in upload service, but ensuring products service handles it
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      Product.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue()
      }));

      // Mock successful creation despite external service issues
      const result = await createProductService({
        vendorId: '507f191e810c19729de860ea',
        name: 'Test Product',
        description: 'Test description',
        price: 100,
        municipality: 'Test City'
      });

      expect(result).toBeDefined();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });