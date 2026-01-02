const Product = require('../products.model.js');
const logger = require('../../../utils/logger');
const { withDatabaseRetry, withOptimisticLocking } = require('../../../utils/reliability.js');
const { DatabaseError, ValidationError } = require('../../../utils/errorHandler');

/**
 * Product Stock Service - Handles all stock-related operations
 */
class ProductStockService {
  /**
   * Add stock to main product
   */
  async addMainStock(productId, delta) {
    if (!productId || delta === undefined || delta === null) {
      throw new ValidationError('Product ID and stock delta are required');
    }

    if (!Number.isFinite(delta)) {
      throw new ValidationError('Stock delta must be a number');
    }

    return withDatabaseRetry(async () => {
      return withOptimisticLocking(Product, productId, async (product) => {
        const newStock = Math.max(0, product.stock + delta);

        logger.info(`Updating main product stock: ${productId}, delta: ${delta}, new stock: ${newStock}`);

        return {
          stock: newStock,
          sold: delta < 0 ? Math.max(0, product.sold + Math.abs(delta)) : product.sold,
          updatedAt: new Date()
        };
      });
    });
  }

  /**
   * Add stock to product option
   */
  async addOptionStock(productId, optionId, delta) {
    if (!productId || !optionId || delta === undefined || delta === null) {
      throw new ValidationError('Product ID, option ID, and stock delta are required');
    }

    if (!Number.isFinite(delta)) {
      throw new ValidationError('Stock delta must be a number');
    }

    return withDatabaseRetry(async () => {
      return withOptimisticLocking(Product, productId, async (product) => {
        const option = product.option?.find(opt => opt._id.toString() === optionId);

        if (!option) {
          throw new DatabaseError('Product option not found');
        }

        const newStock = Math.max(0, option.stock + delta);

        logger.info(`Updating option stock: ${productId}:${optionId}, delta: ${delta}, new stock: ${newStock}`);

        // Update the option in the array
        const optionIndex = product.option.findIndex(opt => opt._id.toString() === optionId);
        product.option[optionIndex] = {
          ...option,
          stock: newStock,
          sold: delta < 0 ? Math.max(0, option.sold + Math.abs(delta)) : option.sold,
          updatedAt: new Date()
        };

        return {
          option: product.option,
          updatedAt: new Date()
        };
      });
    });
  }

  /**
   * Reserve stock (for order processing)
   */
  async reserveStock(productId, optionId = null, quantity) {
    if (!productId || quantity === undefined || quantity === null) {
      throw new ValidationError('Product ID and quantity are required');
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Quantity must be a positive number');
    }

    return withDatabaseRetry(async () => {
      return withOptimisticLocking(Product, productId, async (product) => {
        if (optionId) {
          // Reserve from option
          const option = product.option?.find(opt => opt._id.toString() === optionId);
          if (!option) {
            throw new DatabaseError('Product option not found');
          }

          if (option.stock < quantity) {
            throw new ValidationError('Insufficient stock for option');
          }

          const optionIndex = product.option.findIndex(opt => opt._id.toString() === optionId);
          product.option[optionIndex] = {
            ...option,
            stock: option.stock - quantity,
            sold: option.sold + quantity,
            updatedAt: new Date()
          };

          return {
            option: product.option,
            updatedAt: new Date()
          };
        } else {
          // Reserve from main product
          if (product.stock < quantity) {
            throw new ValidationError('Insufficient stock');
          }

          return {
            stock: product.stock - quantity,
            sold: product.sold + quantity,
            updatedAt: new Date()
          };
        }
      });
    });
  }

  /**
   * Release reserved stock (for failed orders)
   */
  async releaseStock(productId, optionId = null, quantity) {
    if (!productId || quantity === undefined || quantity === null) {
      throw new ValidationError('Product ID and quantity are required');
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Quantity must be a positive number');
    }

    return withDatabaseRetry(async () => {
      return withOptimisticLocking(Product, productId, async (product) => {
        if (optionId) {
          // Release to option
          const option = product.option?.find(opt => opt._id.toString() === optionId);
          if (!option) {
            throw new DatabaseError('Product option not found');
          }

          const optionIndex = product.option.findIndex(opt => opt._id.toString() === optionId);
          product.option[optionIndex] = {
            ...option,
            stock: option.stock + quantity,
            sold: Math.max(0, option.sold - quantity),
            updatedAt: new Date()
          };

          return {
            option: product.option,
            updatedAt: new Date()
          };
        } else {
          // Release to main product
          return {
            stock: product.stock + quantity,
            sold: Math.max(0, product.sold - quantity),
            updatedAt: new Date()
          };
        }
      });
    });
  }

  /**
   * Get stock levels for product
   */
  async getStockLevels(productId) {
    return withDatabaseRetry(async () => {
      const product = await Product.findById(productId)
        .select('stock sold option.stock option.sold')
        .lean();

      if (!product) {
        throw new DatabaseError('Product not found');
      }

      const stockInfo = {
        main: {
          available: product.stock,
          sold: product.sold
        },
        options: {}
      };

      if (product.option && product.option.length > 0) {
        product.option.forEach(option => {
          stockInfo.options[option._id] = {
            available: option.stock,
            sold: option.sold
          };
        });
      }

      return stockInfo;
    });
  }

  /**
   * Check stock availability
   */
  async checkAvailability(productId, optionId = null, quantity) {
    const stockLevels = await this.getStockLevels(productId);

    if (optionId) {
      const optionStock = stockLevels.options[optionId];
      if (!optionStock) {
        return { available: false, reason: 'Option not found' };
      }
      return {
        available: optionStock.available >= quantity,
        availableStock: optionStock.available
      };
    } else {
      return {
        available: stockLevels.main.available >= quantity,
        availableStock: stockLevels.main.available
      };
    }
  }

  /**
   * Bulk stock update for multiple products
   */
  async bulkStockUpdate(updates) {
    const operations = updates.map(({ productId, optionId, delta }) => {
      if (optionId) {
        return this.addOptionStock(productId, optionId, delta);
      } else {
        return this.addMainStock(productId, delta);
      }
    });

    const results = await Promise.allSettled(operations);

    const successful = [];
    const failed = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          index,
          update: updates[index],
          error: result.reason
        });
      }
    });

    logger.info(`Bulk stock update: ${successful.length} successful, ${failed.length} failed`);

    if (failed.length > 0) {
      logger.warn('Failed stock updates:', failed);
    }

    return { successful, failed };
  }
}

module.exports = ProductStockService;