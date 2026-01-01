const { body, param, query, validationResult } = require("express-validator");
const { ValidationError } = require("../utils/errorHandler");

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => err.msg);
    throw new ValidationError("Validation failed", errorMessages);
  }
  next();
};

/**
 * Validator for creating checkout payment
 * Note: orderId is optional when paymentMethod is 'qrph'
 * For QRPH payments, checkoutData is required instead
 */
exports.validateCheckoutPayment = [
  body("orderId")
    .optional()
    .isMongoId()
    .withMessage("Invalid order ID format"),
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isInt({ min: 0 })
    .withMessage("Amount must be at least 0 PHP (0 centavos)"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),
  body("metadata")
    .optional()
    .isObject()
    .withMessage("Metadata must be an object"),
  body("paymentMethod")
    .optional()
    .trim()
    .isIn(["qrph", "gcash", "card", "grab_pay", "maya"])
    .withMessage("Invalid payment method"),
  // Checkout data validation for QRPH payments
  body("checkoutData")
    .optional()
    .isObject()
    .withMessage("Checkout data must be an object"),
  body("checkoutData.items")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Checkout data must have at least one item"),
  body("checkoutData.items.*.vendorId")
    .optional()
    .isMongoId()
    .withMessage("Each item must have a valid vendor ID"),
  body("checkoutData.items.*.productId")
    .optional()
    .isMongoId()
    .withMessage("Each item must have a valid product ID"),
  body("checkoutData.items.*.price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Each item must have a valid price"),
  body("checkoutData.items.*.quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Each item must have a valid quantity"),
  body("checkoutData.customerName")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Customer name is required and must not exceed 200 characters"),
  body("checkoutData.phone")
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage("Phone number is required"),
  body("checkoutData.shippingAddress")
    .optional()
    .isObject()
    .withMessage("Shipping address must be an object"),
  // Custom validation: require orderId unless paymentMethod is 'qrph'
  body("orderId").custom((value, { req }) => {
    if (req.body.paymentMethod !== "qrph" && !value) {
      throw new Error("Order ID is required for non-QRPH payments");
    }
    return true;
  }),
  // Custom validation: require checkoutData for QRPH payments
  body("checkoutData").custom((value, { req }) => {
    if (req.body.paymentMethod === "qrph" && !req.body.orderId) {
      if (!value) {
        throw new Error("Checkout data is required for QRPH payments");
      }
      if (!value.items || value.items.length === 0) {
        throw new Error("Checkout data must contain at least one item");
      }
      if (!value.customerName) {
        throw new Error("Customer name is required in checkout data");
      }
      if (!value.phone) {
        throw new Error("Phone number is required in checkout data");
      }
    }
    return true;
  }),
  validate,
];

/**
 * Validator for attaching payment method
 */
exports.validateAttachPaymentMethod = [
  body("paymentIntentId")
    .notEmpty()
    .withMessage("Payment Intent ID is required")
    .trim(),
  body("paymentMethodId")
    .notEmpty()
    .withMessage("Payment Method ID is required")
    .trim(),
  body("returnUrl")
    .optional()
    .isURL()
    .withMessage("Return URL must be a valid URL"),
  validate,
];

/**
 * Validator for checking payment status
 */
exports.validatePaymentIntentId = [
  param("paymentIntentId")
    .notEmpty()
    .withMessage("Payment Intent ID is required")
    .trim(),
  validate,
];

/**
 * Validator for creating refund
 */
exports.validateRefund = [
  body("paymentId")
    .notEmpty()
    .withMessage("Payment ID is required")
    .isMongoId()
    .withMessage("Invalid payment ID format"),
  body("amount")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Refund amount must be at least 1 centavo"),
  body("reason")
    .notEmpty()
    .withMessage("Refund reason is required")
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason must not exceed 500 characters"),
  body("metadata")
    .optional()
    .isObject()
    .withMessage("Metadata must be an object"),
  validate,
];

/**
 * Validator for cash-in payment
 */
exports.validateCashIn = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isInt({ min: 0, max: 10000000 })
    .withMessage("Amount must be between 0 PHP and 100,000 PHP"),
  body("paymentMethod")
    .optional()
    .isIn(["gcash", "card", "grab_pay", "paymaya"])
    .withMessage("Invalid payment method"),
  validate,
];

/**
 * Validator for withdrawal request
 */
exports.validateWithdrawal = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isInt({ min: 100000 })
    .withMessage("Minimum withdrawal amount is 1,000 PHP (100000 centavos)"),
  body("bankAccount")
    .notEmpty()
    .withMessage("Bank account details are required")
    .isObject()
    .withMessage("Bank account must be an object"),
  body("bankAccount.accountNumber")
    .notEmpty()
    .withMessage("Account number is required")
    .trim()
    .isLength({ min: 10, max: 20 })
    .withMessage("Invalid account number length"),
  body("bankAccount.accountName")
    .notEmpty()
    .withMessage("Account name is required")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Account name must be between 2 and 100 characters"),
  body("bankAccount.bankName")
    .notEmpty()
    .withMessage("Bank name is required")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Bank name must be between 2 and 100 characters"),
  validate,
];

/**
 * Validator for getting user payments
 */
exports.validateGetPayments = [
  query("type")
    .optional()
    .isIn(["checkout", "refund", "withdraw", "cash_in"])
    .withMessage("Invalid payment type"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  validate,
];

/**
 * Validator for payment ID param
 */
exports.validatePaymentId = [
  param("id")
    .notEmpty()
    .withMessage("Payment ID is required")
    .isMongoId()
    .withMessage("Invalid payment ID format"),
  validate,
];

/**
 * Validator for cancelling payment
 */
exports.validateCancelPayment = [
  param("paymentIntentId")
    .notEmpty()
    .withMessage("Payment Intent ID is required")
    .trim(),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason must not exceed 500 characters"),
  validate,
];
