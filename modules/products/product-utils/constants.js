/**
 * Product Management Constants
 */

// Product Status Constants
const PRODUCT_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected'
});

// User Roles
const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  VENDOR: 'vendor',
  CUSTOMER: 'customer'
});

// Permissions
const PERMISSIONS = Object.freeze({
  CREATE_PRODUCT: 'create_product',
  UPDATE_PRODUCT: 'update_product',
  DELETE_PRODUCT: 'delete_product',
  MANAGE_PRODUCT_STOCK: 'manage_product_stock',
  VIEW_ALL_PRODUCTS: 'view_all_products',
  APPROVE_PRODUCTS: 'approve_products',
  DISABLE_PRODUCTS: 'disable_products'
});

// Role-based Permissions Mapping
const ROLE_PERMISSIONS = Object.freeze({
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
});

// Cache TTL Constants (in seconds)
const CACHE_TTL = Object.freeze({
  // Short-lived caches (2-5 minutes)
  SHORT: 120,              // 2 minutes - for volatile data
  MEDIUM: 300,             // 5 minutes - for moderately changing data

  // Standard product caches
  PRODUCT_LIST: 300,       // 5 minutes - paginated product lists
  INDIVIDUAL_PRODUCT: 600, // 10 minutes - single product details
  SEARCH_RESULTS: 180,     // 3 minutes - search results (more volatile)
  CATEGORY_LIST: 300,      // 5 minutes - category-filtered lists
  MUNICIPALITY_LIST: 300,  // 5 minutes - municipality-filtered lists
  VENDOR_PRODUCTS: 180,    // 3 minutes - vendor product lists

  // Long-lived caches
  LONG: 3600,              // 1 hour - for stable data
  VERY_LONG: 86400,        // 24 hours - for rarely changing data

  // Special purpose
  PROMOTION_DATA: 60,      // 1 minute - promotion data (time-sensitive)
  STOCK_LEVELS: 30         // 30 seconds - stock levels (critical)
});

// Database Query Limits
const QUERY_LIMITS = Object.freeze({
  MAX_PRODUCTS_PER_PAGE: 100,
  MAX_SEARCH_RESULTS: 200,
  MAX_RELATED_PRODUCTS: 12,
  MAX_VENDOR_PRODUCTS: 500,
  DEFAULT_PAGE_SIZE: 20
});

// Product Validation Constants
const PRODUCT_VALIDATION = Object.freeze({
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_CATEGORIES: 10,
  MAX_CATEGORY_LENGTH: 50,
  MAX_MUNICIPALITY_LENGTH: 100,
  MAX_IMAGE_URLS: 20,
  MIN_PRICE: 0,
  MAX_STOCK: 1000000,      // 1 million max stock
  MAX_PROMOTION_DISCOUNT: 100, // 100% max discount
  MAX_SEARCH_TERMS: 6,
  MAX_TERM_LENGTH: 64
});

// Stock Management Constants
const STOCK_OPERATIONS = Object.freeze({
  MIN_STOCK_ADDITION: 1,
  MAX_STOCK_ADDITION: 10000,
  MIN_STOCK_LEVEL: 0,
  MAX_STOCK_LEVEL: 1000000
});

// Search and Filter Constants
const SEARCH_CONFIG = Object.freeze({
  TEXT_INDEX_NAME: 'name_description_categories',
  MAX_TEXT_SEARCH_LENGTH: 100,
  FUZZY_MATCH_THRESHOLD: 0.8,
  SIMILARITY_BOOST_FACTOR: 1.2
});

// Aggregation Pipeline Constants
const AGGREGATION_CONSTANTS = Object.freeze({
  RELATED_PRODUCTS_LIMIT: 6,
  POPULAR_PRODUCTS_LIMIT: 10,
  RECENT_PRODUCTS_LIMIT: 20,
  TOP_RATED_LIMIT: 10
});

// Pagination Constants
const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_SKIP: 0
});

// Search Constants
const SEARCH = Object.freeze({
  MAX_QUERY_LENGTH: 100,
  MAX_TERMS: 6,
  MAX_TERM_LENGTH: 64,
  TEXT_SCORE_THRESHOLD: 0.5
});

// Stock Constants
const STOCK = Object.freeze({
  MIN_STOCK: 0,
  MAX_BULK_UPDATE_SIZE: 50
});

// Validation Constants
const VALIDATION = Object.freeze({
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_CATEGORY_LENGTH: 50,
  MAX_MUNICIPALITY_LENGTH: 100,
  MAX_CATEGORIES: 10,
  MAX_OPTIONS: 20,
  MAX_IMAGE_URLS: 10
});

// Rate Limiting Constants
const RATE_LIMITS = Object.freeze({
  CREATE_PRODUCT: { windowSec: 60, maxRequests: 5 },
  UPDATE_PRODUCT: { windowSec: 60, maxRequests: 5 },
  DELETE_PRODUCT: { windowSec: 60, maxRequests: 5 },
  STOCK_UPDATE: { windowSec: 60, maxRequests: 10 },
  SEARCH: { windowSec: 60, maxRequests: 100 },
  GET_PRODUCTS: { windowSec: 60, maxRequests: 100 }
});

// Promotion Constants
const PROMOTION = Object.freeze({
  DISCOUNT_TYPES: ['percentage', 'fixed', 'none'],
  MAX_DISCOUNT_PERCENTAGE: 90,
  MAX_DISCOUNT_FIXED: 1000000 // 1M currency units
});

// Error Messages
const ERROR_MESSAGES = Object.freeze({
  PRODUCT_NOT_FOUND: 'Product not found',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  INVALID_PRODUCT_DATA: 'Invalid product data',
  STOCK_UPDATE_FAILED: 'Stock update failed',
  CONCURRENT_MODIFICATION: 'Concurrent modification detected',
  EXTERNAL_SERVICE_ERROR: 'External service temporarily unavailable'
});

// Logging Constants
const LOG_LEVELS = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
});

// Monitoring Constants
const METRICS = Object.freeze({
  CACHE_HIT_RATE: 'cache_hit_rate',
  QUERY_PERFORMANCE: 'query_performance',
  ERROR_RATE: 'error_rate',
  STOCK_UPDATE_SUCCESS: 'stock_update_success',
  PRODUCT_CREATION_TIME: 'product_creation_time'
});

module.exports = {
  PRODUCT_STATUS,
  USER_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  CACHE_TTL,
  QUERY_LIMITS,
  PRODUCT_VALIDATION,
  STOCK_OPERATIONS,
  SEARCH_CONFIG,
  AGGREGATION_CONSTANTS,
  PAGINATION,
  SEARCH,
  STOCK,
  VALIDATION,
  RATE_LIMITS,
  PROMOTION,
  ERROR_MESSAGES,
  LOG_LEVELS,
  METRICS
};