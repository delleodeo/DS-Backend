const express = require("express");
const router = express.Router();
const orderController = require("./orders.controller");
const {protect, restrictTo} = require("../../auth/auth.controller")

// Import escrow controller for refund requests
const escrowController = require("../admin/controllers/escrow.controller");

router.post("/", protect, orderController.createOrder);
router.get("/", protect, orderController.getOrdersByUser);
router.get("/vendor", protect, orderController.getOrdersByVendor);
router.get("/product/:productId", orderController.getOrdersByProduct);
router.get("/:id", orderController.getOrderById);
router.patch("/:orderId/status", orderController.updateOrderStatus);
router.put("/cancel/:id", orderController.cancelOrder);
router.post("/:id/agreement-message", protect, orderController.addAgreementMessage);

// Customer refund request endpoint
router.post("/:orderId/request-refund", protect, escrowController.requestRefund);

module.exports = router;
