const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../auth/auth.controller.js");

const productRoutes = require("../modules/products/products.routes");
const promotionRoutes = require("../modules/products/promotion.routes");
const cartRoutes = require("../modules/cart/cart.routes");
const orderRoutes = require("../modules/orders/orders.routes");
const userRoutes = require("../modules/users/users.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const vendorRoutes = require("../modules/vendors/vendors.routes");
const uploadRoutes = require("../modules/upload/upload.routes");
const reviewRoutes = require("../modules/reviews/review.routes");
const messageRoutes = require("../modules/messages/message.routes");
const socketTestRoutes = require("./socket-test");

router.use("/products", productRoutes);
router.use("/products", promotionRoutes);
router.use("/cart", protect, cartRoutes);
router.use("/order", orderRoutes);
router.use("/user", userRoutes);
router.use("/admin", protect, restrictTo("admin"), adminRoutes);
router.use("/vendor", vendorRoutes);
router.use("/upload", uploadRoutes);
router.use("/reviews", reviewRoutes);
router.use("/messages", messageRoutes);
router.use("/socket-test", socketTestRoutes);

module.exports = router;
