const logger = require('../utils/logger');

// Error types
const ERROR_TYPES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

// HTTP status codes
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, type = ERROR_TYPES.INTERNAL_ERROR, status = HTTP_STATUS.INTERNAL_SERVER_ERROR, isOperational = true) {
    super(message);
    this.type = type;
    this.status = status;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error
 */
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, ERROR_TYPES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    this.details = details;
  }
}

/**
 * Authentication error
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, ERROR_TYPES.AUTHENTICATION_ERROR, HTTP_STATUS.UNAUTHORIZED);
  }
}

/**
 * Authorization error
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, ERROR_TYPES.AUTHORIZATION_ERROR, HTTP_STATUS.FORBIDDEN);
  }
}

/**
 * Not found error
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, ERROR_TYPES.NOT_FOUND_ERROR, HTTP_STATUS.NOT_FOUND);
  }
}

/**
 * Conflict error
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, ERROR_TYPES.CONFLICT_ERROR, HTTP_STATUS.CONFLICT);
  }
}

/**
 * External service error
 */
class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`External service error: ${service} - ${message}`, ERROR_TYPES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.SERVICE_UNAVAILABLE);
    this.service = service;
  }
}

/**
 * Database error
 */
class DatabaseError extends AppError {
  constructor(message, operation) {
    super(`Database error during ${operation}: ${message}`, ERROR_TYPES.DATABASE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    this.operation = operation;
  }
}

/**
 * Cache error
 */
class CacheError extends AppError {
  constructor(message, operation) {
    super(`Cache error during ${operation}: ${message}`, ERROR_TYPES.CACHE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    this.operation = operation;
  }
}

/**
 * Rate limit error
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, ERROR_TYPES.RATE_LIMIT_ERROR, HTTP_STATUS.TOO_MANY_REQUESTS);
  }
}

/**
 * Error response formatter
 */
const formatErrorResponse = (error) => {
  const baseResponse = {
    error: {
      type: error.type || ERROR_TYPES.INTERNAL_ERROR,
      message: error.message,
      timestamp: error.timestamp || new Date().toISOString()
    }
  };

  // Add additional details for specific error types
  if (error.type === ERROR_TYPES.VALIDATION_ERROR && error.details) {
    baseResponse.error.details = error.details;
  }

  // In production, don't leak internal error details
  if (process.env.NODE_ENV === 'production' && error.status >= 500) {
    baseResponse.error.message = 'Internal server error';
  }

  return baseResponse;
};

/**
 * Global error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  // Log the error
  logger.error('Error occurred:', {
    type: error.type,
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Handle different error types
  let statusCode = error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let response = formatErrorResponse(error);

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    response = formatErrorResponse(new ValidationError('Validation failed', Object.values(error.errors).map(e => e.message)));
  }

  // Handle Mongoose cast errors
  if (error.name === 'CastError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    response = formatErrorResponse(new ValidationError('Invalid ID format'));
  }

  // Handle duplicate key errors
  if (error.code === 11000) {
    statusCode = HTTP_STATUS.CONFLICT;
    response = formatErrorResponse(new ConflictError('Resource already exists'));
  }

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  DatabaseError,
  CacheError,
  RateLimitError,
  ERROR_TYPES,
  HTTP_STATUS,
  errorHandler,
  asyncHandler,
  formatErrorResponse
};