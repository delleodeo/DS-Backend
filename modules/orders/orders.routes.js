const express = require("express");
const router = express.Router();
const orderController = require("./orders.controller");
const {protect} = require("../../auth/auth.controller")

router.post("/", protect, orderController.createOrder);
router.get("/", protect, orderController.getOrdersByUser);
router.get("/vendor", protect, orderController.getOrdersByVendor);
router.get("/product/:productId", orderController.getOrdersByProduct);
router.get("/:id", orderController.getOrderById);
router.patch("/:orderId/status", orderController.updateOrderStatus);
router.put("/cancel/:id", orderController.cancelOrder);

module.exports = router;
