const Product = require('../products.model.js');
const { AuthorizationError, NotFoundError } = require('../../../utils/errorHandler');

/**
 * User roles constants
 */
const USER_ROLES = {
  ADMIN: 'admin',
  VENDOR: 'vendor',
  CUSTOMER: 'customer'
};

/**
 * Permission levels
 */
const PERMISSIONS = {
  CREATE_PRODUCT: 'create_product',
  UPDATE_PRODUCT: 'update_product',
  DELETE_PRODUCT: 'delete_product',
  MANAGE_PRODUCT_STOCK: 'manage_product_stock',
  VIEW_ALL_PRODUCTS: 'view_all_products',
  APPROVE_PRODUCTS: 'approve_products',
  DISABLE_PRODUCTS: 'disable_products'
};

/**
 * Role-based permissions mapping
 */
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.CREATE_PRODUCT,
    PERMISSIONS.UPDATE_PRODUCT,
    PERMISSIONS.DELETE_PRODUCT,
    PERMISSIONS.MANAGE_PRODUCT_STOCK,
    PERMISSIONS.VIEW_ALL_PRODUCTS,
    PERMISSIONS.APPROVE_PRODUCTS,
    PERMISSIONS.DISABLE_PRODUCTS
  ],
  [USER_ROLES.VENDOR]: [
    PERMISSIONS.CREATE_PRODUCT,
    PERMISSIONS.UPDATE_PRODUCT,
    PERMISSIONS.DELETE_PRODUCT,
    PERMISSIONS.MANAGE_PRODUCT_STOCK
  ],
  [USER_ROLES.CUSTOMER]: [
    PERMISSIONS.VIEW_ALL_PRODUCTS
  ]
};

/**
 * Check if user has specific permission
 * @param {Object} user - User object
 * @param {string} permission - Required permission
 * @returns {boolean}
 */
const hasPermission = (user, permission) => {
  if (!user || !user.role) return false;
  const userPermissions = ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission);
};

/**
 * Middleware to verify that the current authenticated user is the vendor
 * who owns the product OR an admin user.
 */
async function verifyOwnership(req, res, next) {
  try {
    const productId = req.params.productId || req.params.id || req.params.product_id;
    if (!productId) {
      throw new AuthorizationError('Missing product identifier');
    }

    const product = await Product.findById(productId).select('vendorId status isDisabled');
    if (!product) {
      throw new NotFoundError('Product');
    }

    // Check if product is disabled
    if (product.isDisabled) {
      throw new AuthorizationError('This product has been disabled');
    }

    // Admins can act on any product
    if (hasPermission(req.user, PERMISSIONS.UPDATE_PRODUCT)) {
      return next();
    }

    // Vendors can only act on their own products
    if (!req.user || !hasPermission(req.user, PERMISSIONS.UPDATE_PRODUCT) || req.user.id !== product.vendorId.toString()) {
      throw new AuthorizationError('You do not own this product');
    }

    // All good
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware to verify admin permissions
 */
function requireAdmin(permission = null) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    const requiredPermission = permission || PERMISSIONS.APPROVE_PRODUCTS;
    if (!hasPermission(req.user, requiredPermission)) {
      return next(new AuthorizationError('Admin access required'));
    }

    next();
  };
}

/**
 * Middleware to verify vendor permissions
 */
function requireVendor(permission = null) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    const requiredPermission = permission || PERMISSIONS.CREATE_PRODUCT;
    if (!hasPermission(req.user, requiredPermission)) {
      return next(new AuthorizationError('Vendor access required'));
    }

    next();
  };
}

/**
 * Middleware to check if user owns the product (for read operations)
 */
async function verifyProductAccess(req, res, next) {
  try {
    const productId = req.params.id;
    if (!productId) {
      throw new AuthorizationError('Missing product identifier');
    }

    const product = await Product.findById(productId).select('vendorId status isDisabled');
    
    // If product doesn't exist, let the controller handle it
    if (!product) {
      return next();
    }

    // Check if product is approved or user owns it
    const isOwner = req.user && req.user.id === product.vendorId.toString();
    const isAdmin = hasPermission(req.user, PERMISSIONS.VIEW_ALL_PRODUCTS);
    const isApproved = product.status === 'approved' && !product.isDisabled;

    if (!isApproved && !isOwner && !isAdmin) {
      throw new AuthorizationError('Product not available');
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  verifyOwnership,
  requireAdmin,
  requireVendor,
  verifyProductAccess,
  hasPermission,
  USER_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS
};
