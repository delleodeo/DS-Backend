const Joi = require('joi');
const mongoose = require('mongoose');

// Custom ObjectId validator
const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.isValidObjectId(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation');

// Validation schemas
const addToCartSchema = Joi.object({
  item: Joi.object({
    productId: objectId.required().messages({
      'any.invalid': 'Invalid productId format'
    }),
    optionId: objectId.optional().messages({
      'any.invalid': 'Invalid optionId format'
    }),
    quantity: Joi.number().integer().min(1).max(50).required().messages({
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Quantity cannot exceed 50'
    })
  }).required()
}).options({ stripUnknown: true });

const updateCartItemSchema = Joi.object({
  item: Joi.object({
    productId: objectId.required().messages({
      'any.invalid': 'Invalid productId format'
    }),
    optionId: objectId.optional().messages({
      'any.invalid': 'Invalid optionId format'
    }),
    quantity: Joi.number().integer().min(-50).max(50).required().messages({
      'number.min': 'Quantity change cannot be less than -50',
      'number.max': 'Quantity change cannot exceed 50'
    })
  }).required()
}).options({ stripUnknown: true });

const removeCartItemSchema = Joi.object({
  productId: objectId.required().messages({
    'any.invalid': 'Invalid productId format'
  }),
  optionId: objectId.optional().messages({
    'any.invalid': 'Invalid optionId format'
  })
}).options({ stripUnknown: true });

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        message: 'Validation failed',
        errors
      });
    }

    req.body = value; // Use sanitized value
    next();
  };
};

module.exports = {
  validateAddToCart: validate(addToCartSchema),
  validateUpdateCartItem: validate(updateCartItemSchema),
  validateRemoveCartItem: validate(removeCartItemSchema)
};