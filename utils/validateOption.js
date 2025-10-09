// utils/validateOption.js
function validateOptionPayload(obj) {
  const errors = [];

  if (obj.price == null || typeof obj.price !== 'number' || obj.price < 0)
    errors.push('price must be a non-negative number');

  if (obj.stock != null && (typeof obj.stock !== 'number' || obj.stock < 0))
    errors.push('stock must be a non-negative number');

  if (obj.sold != null && (typeof obj.sold !== 'number' || obj.sold < 0))
    errors.push('sold must be a non-negative number');

  if (obj.label && typeof obj.label !== 'string')
    errors.push('label must be a string');

  if (obj.imageUrl && typeof obj.imageUrl !== 'string')
    errors.push('imageUrl must be a string');

  if (obj.isHot != null && typeof obj.isHot !== 'boolean')
    errors.push('isHot must be boolean');

  return errors;
}

module.exports = { validateOptionPayload };
