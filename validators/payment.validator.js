const { body, param, query, validationResult } = require("express-validator");
const { ValidationError } = require("../utils/errorHandler");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => err.msg);
    throw new ValidationError("Validation failed", errorMessages);
  }
  next();
};

exports.validateCheckoutPayment = [
  body("orderId").optional().isMongoId().withMessage("Invalid order ID format"),
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
  body("metadata").optional().isObject().withMessage("Metadata must be an object"),
  body("paymentMethod")
    .optional()
    .trim()
    .isIn(["qrph", "gcash", "card", "grab_pay", "maya"])
    .withMessage("Invalid payment method"),
  body("checkoutData").optional().isObject().withMessage("Checkout data must be an object"),
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
  body("orderId").custom((value, { req }) => {
    if (req.body.paymentMethod !== "qrph" && !value) {
      throw new Error("Order ID is required for non-QRPH payments");
    }
    return true;
  }),
  body("checkoutData").custom((value, { req }) => {
    if (req.body.paymentMethod === "qrph" && !req.body.orderId) {
      if (!value) throw new Error("Checkout data is required for QRPH payments");
      if (!value.items || value.items.length === 0) throw new Error("Checkout data must contain at least one item");
      if (!value.customerName) throw new Error("Customer name is required in checkout data");
      if (!value.phone) throw new Error("Phone number is required in checkout data");
    }
    return true;
  }),
  validate,
];

exports.validateAttachPaymentMethod = [
  body("paymentIntentId").notEmpty().withMessage("Payment Intent ID is required").trim(),
  body("paymentMethodId").notEmpty().withMessage("Payment Method ID is required").trim(),
  body("returnUrl").optional().isURL().withMessage("Return URL must be a valid URL"),
  validate,
];

exports.validatePaymentIntentId = [
  param("paymentIntentId").notEmpty().withMessage("Payment Intent ID is required").trim(),
  validate,
];

exports.validateRefund = [
  body("paymentId")
    .notEmpty()
    .withMessage("Payment ID is required")
    .isMongoId()
    .withMessage("Invalid payment ID format"),
  body("amount").optional().isInt({ min: 1 }).withMessage("Refund amount must be at least 1 centavo"),
  body("reason")
    .notEmpty()
    .withMessage("Refund reason is required")
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason must not exceed 500 characters"),
  body("metadata").optional().isObject().withMessage("Metadata must be an object"),
  validate,
];

exports.validateCashIn = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isInt({ min: 0, max: 10000000 })
    .withMessage("Amount must be between 0 PHP and 100,000 PHP"),
  body("paymentMethod")
    .optional()
    .isIn(["gcash", "card", "grab_pay", "paymaya", "qrph"])
    .withMessage("Invalid payment method"),
  validate,
];

exports.validateWithdrawal = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isInt({ min: 10000 })
    .withMessage("Minimum withdrawal amount is 100 PHP (10000 centavos)"),
  body("payoutMethod")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["gcash", "paymaya"])
    .withMessage("Withdrawal payout method must be GCash or PayMaya"),
  body("bankAccount")
    .notEmpty()
    .withMessage("Payout details are required")
    .isObject()
    .withMessage("Payout details must be an object"),
  body("bankAccount.accountNumber")
    .notEmpty()
    .withMessage("Mobile number is required")
    .trim()
    .matches(/^(?:\+63|63|0)9\d{9}$/)
    .withMessage("Invalid PH mobile number (use 09XXXXXXXXX or +639XXXXXXXXX)"),
  body("bankAccount.accountName")
    .notEmpty()
    .withMessage("Account name is required")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Account name must be between 2 and 100 characters"),
  body("bankAccount.bankName")
    .optional()
    .trim()
    .custom((value, { req }) => {
      const method = String(req.body.payoutMethod || "").toLowerCase();
      if (!method) return true;
      const expected = method === "gcash" ? "gcash" : "paymaya";
      if (!value) return true;
      if (String(value).toLowerCase() !== expected) {
        throw new Error("bankName must match payout method (GCash/PayMaya)");
      }
      return true;
    }),
  validate,
];

exports.validateGetPayments = [
  query("type").optional().isIn(["checkout", "refund", "withdraw", "cash_in"]).withMessage("Invalid payment type"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  validate,
];

exports.validatePaymentId = [
  (req, res, next) => {
    const paymentId = req.params.id || req.params.paymentId;
    if (!paymentId) {
      throw new ValidationError("Validation failed", ["Payment ID is required"]);
    }
    if (!/^[0-9a-fA-F]{24}$/.test(paymentId)) {
      throw new ValidationError("Validation failed", ["Invalid payment ID format"]);
    }
    req.params.id = paymentId;
    req.params.paymentId = paymentId;
    next();
  },
];

exports.validateCancelPayment = [
  param("paymentIntentId").notEmpty().withMessage("Payment Intent ID is required").trim(),
  body("reason").optional().trim().isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters"),
  validate,
];
