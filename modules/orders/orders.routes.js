const express = require("express");
const router = express.Router();
const orderController = require("./orders.controller");
const {protect, restrictTo} = require("../../auth/auth.controller")
const rateLimiter = require("../../utils/rateLimiter");
const escrowController = require("../admin/controllers/escrow.controller");

const createOrderLimiter = rateLimiter({ windowSec: 60, maxRequests: 10, keyPrefix: "rl:order:create" });
const refundLimiter = rateLimiter({ windowSec: 300, maxRequests: 5, keyPrefix: "rl:order:refund" });
const generalLimiter = rateLimiter({ windowSec: 60, maxRequests: 30, keyPrefix: "rl:order:general" });

router.post("/", protect, createOrderLimiter, orderController.createOrder);
router.get("/", protect, generalLimiter, orderController.getOrdersByUser);
router.get("/counts", protect, generalLimiter, orderController.getOrderStatusCounts);
router.get("/vendor", protect, restrictTo("vendor"), generalLimiter, orderController.getOrdersByVendor);
router.get("/product/:productId", generalLimiter, orderController.getOrdersByProduct);
router.get("/:id", generalLimiter, orderController.getOrderById);
router.patch("/:orderId/status", protect, generalLimiter, orderController.updateOrderStatus);
router.put("/cancel/:id", protect, generalLimiter, orderController.cancelOrder);
router.post("/:id/agreement-message", protect, generalLimiter, orderController.addAgreementMessage);
router.post("/:orderId/request-refund", protect, refundLimiter, escrowController.requestRefund);
router.post("/:orderId/cancel-refund", protect, refundLimiter, escrowController.cancelRefundRequest);

module.exports = router;
