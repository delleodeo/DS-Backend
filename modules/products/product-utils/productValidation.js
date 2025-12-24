const Joi = require('joi');

// Common validation schemas
const objectIdSchema = Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages({
  'string.pattern.base': 'Invalid ObjectId format'
});

const promotionSchema = Joi.object({
  isActive: Joi.boolean().default(false),
  discountType: Joi.string().valid('percentage', 'fixed', 'none').default('none'),
  discountValue: Joi.number().min(0).default(0),
  startDate: Joi.any().allow(null),
  endDate: Joi.any().allow(null),
  freeShipping: Joi.boolean().default(false)
}).default(() => ({}));

const optionSchema = Joi.object({
  imageUrl: Joi.string().allow(''),
  price: Joi.number().min(0).required(),
  label: Joi.string().allow(''),
  isHot: Joi.boolean().default(false),
  stock: Joi.number().min(0).default(0),
  sold: Joi.number().min(0).default(0),
  promotion: promotionSchema
});

// Product creation schema
const createProductSchema = Joi.object({
  name: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Product name is required',
    'string.max': 'Product name cannot exceed 200 characters'
  }),
  description: Joi.string().max(2000).allow('').messages({
    'string.max': 'Description cannot exceed 2000 characters'
  }),
  price: Joi.number().min(0).required().messages({
    'number.min': 'Price must be non-negative'
  }),
  stock: Joi.number().min(0).default(0),
  categories: Joi.array().items(Joi.string().min(1).max(50)).default([]),
  isOption: Joi.boolean().default(false),
  imageUrls: Joi.array().items(Joi.string().allow('')).default([]),
  isHot: Joi.boolean().default(false),
  municipality: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Municipality is required'
  }),
  option: Joi.when('isOption', {
    is: true,
    then: Joi.array().items(optionSchema).min(1).messages({
      'array.min': 'At least one option is required when isOption is true'
    }),
    otherwise: Joi.array().items(optionSchema).default([])
  }),
  promotion: promotionSchema
});

// Product update schema (all fields optional)
const updateProductSchema = Joi.object({
  name: Joi.string().min(1).max(200).messages({
    'string.empty': 'Product name cannot be empty',
    'string.max': 'Product name cannot exceed 200 characters'
  }),
  description: Joi.string().max(2000).allow('').messages({
    'string.max': 'Description cannot exceed 2000 characters'
  }),
  price: Joi.number().min(0).messages({
    'number.min': 'Price must be non-negative'
  }),
  stock: Joi.number().min(0),
  categories: Joi.array().items(Joi.string().min(1).max(50)),
  isOption: Joi.boolean(),
  imageUrls: Joi.array().items(Joi.string().uri()),
  isHot: Joi.boolean(),
  municipality: Joi.string().min(1).max(100),
  option: Joi.array().items(optionSchema),
  promotion: promotionSchema
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Add option schema
const addOptionSchema = Joi.object({
  imageUrl: Joi.string().uri().allow(''),
  price: Joi.number().min(0).required(),
  label: Joi.string().allow(''),
  isHot: Joi.boolean().default(false),
  stock: Joi.number().min(0).default(0),
  sold: Joi.number().min(0).default(0),
  promotion: promotionSchema
});

// Update option schema
const updateOptionSchema = Joi.object({
  imageUrl: Joi.string().uri().allow(''),
  price: Joi.number().min(0),
  label: Joi.string().allow(''),
  isHot: Joi.boolean(),
  stock: Joi.number().min(0),
  sold: Joi.number().min(0),
  promotion: promotionSchema
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Stock adjustment schema
const stockAdjustmentSchema = Joi.object({
  delta: Joi.number().integer().not(0).messages({
    'number.not': 'Delta must be non-zero'
  }),
  stock: Joi.number().integer().min(0).messages({
    'number.min': 'Stock must be non-negative'
  })
}).xor('delta', 'stock').messages({
  'object.xor': 'Provide either delta or stock, not both'
});

// Search query schema
const searchQuerySchema = Joi.object({
  q: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Search query is required',
    'string.max': 'Search query too long'
  }),
  limit: Joi.number().integer().min(1).max(100).default(20),
  skip: Joi.number().integer().min(0).default(0)
});

// Pagination schema
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  skip: Joi.number().integer().min(0).default(0),
  category: Joi.string().allow('all').default('all'),
  fresh: Joi.boolean().default(false)
});

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    // Preprocess dates in promotion objects
    const preprocessDates = (obj) => {
      if (obj && typeof obj === 'object') {
        if (obj.promotion) {
          if (obj.promotion.startDate !== undefined) {
            if (obj.promotion.startDate === null || obj.promotion.startDate === '') {
              obj.promotion.startDate = null;
            } else if (typeof obj.promotion.startDate === 'string') {
              const date = new Date(obj.promotion.startDate);
              if (!isNaN(date.getTime())) {
                obj.promotion.startDate = date.toISOString();
              } else {
                // If invalid date string, set to null
                obj.promotion.startDate = null;
              }
            }
          }
          if (obj.promotion.endDate !== undefined) {
            if (obj.promotion.endDate === null || obj.promotion.endDate === '') {
              obj.promotion.endDate = null;
            } else if (typeof obj.promotion.endDate === 'string') {
              const date = new Date(obj.promotion.endDate);
              if (!isNaN(date.getTime())) {
                obj.promotion.endDate = date.toISOString();
              } else {
                // If invalid date string, set to null
                obj.promotion.endDate = null;
              }
            }
          }
        }

        // Process options array
        if (obj.option && Array.isArray(obj.option)) {
          obj.option.forEach(option => preprocessDates(option));
        }
      }
      return obj;
    };

    req.body = preprocessDates(req.body);

    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.body = value;
    next();
  };
};

// Query parameter validation
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, stripUnknown: true });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Query validation failed',
        details: errors
      });
    }

    req.query = value;
    next();
  };
};

module.exports = {
  createProductSchema,
  updateProductSchema,
  addOptionSchema,
  updateOptionSchema,
  stockAdjustmentSchema,
  searchQuerySchema,
  paginationSchema,
  validate,
  validateQuery,
  objectIdSchema
};