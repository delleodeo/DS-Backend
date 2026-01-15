const mongoose = require('mongoose');
const sanitizeMongoInput = require('./sanitizeMongoInput');

const { ValidationError } = require('./errorHandler');

function sanitize(input) {
  return sanitizeMongoInput(input);
}

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.isValidObjectId(id);
}

function validateCartItemPayload(item) {
  if (!item || typeof item !== 'object') {
    throw new ValidationError('Missing or invalid `item` in request body');
  }

  const { productId, optionId, quantity } = item;

  if (!productId || !isValidObjectId(String(productId))) {
    throw new ValidationError('Invalid or missing `productId`');
  }

  if (optionId !== undefined && optionId !== null && !isValidObjectId(String(optionId))) {
    throw new ValidationError('Invalid `optionId`');
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new ValidationError('Invalid `quantity` - must be integer between 1 and 50');
  }

  return {
    productId: String(productId),
    optionId: optionId ? String(optionId) : undefined,
    quantity,
  };
}

function validateCartItemDeltaPayload(item) {
  if (!item || typeof item !== 'object') {
    throw new ValidationError('Missing or invalid `item` in request body');
  }

  const { productId, optionId, quantity } = item;

  if (!productId || !isValidObjectId(String(productId))) {
    throw new ValidationError('Invalid or missing `productId`');
  }

  if (optionId !== undefined && optionId !== null && !isValidObjectId(String(optionId))) {
    throw new ValidationError('Invalid `optionId`');
  }

  if (!Number.isInteger(quantity) || quantity === 0 || Math.abs(quantity) > 50) {
    throw new ValidationError('Invalid `quantity` - must be integer non-zero and abs <= 50');
  }

  return {
    productId: String(productId),
    optionId: optionId ? String(optionId) : undefined,
    quantity,
  };
}

function validateId(id, name = 'id') {
  if (!id || !isValidObjectId(String(id))) {
    throw new ValidationError(`Invalid or missing \
\	\`${name}\``);
  }
  return String(id);
}

module.exports = {
  sanitize,
  validateCartItemPayload,
  validateCartItemDeltaPayload,
  validateId,
  ValidationError,
};