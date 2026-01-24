const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../auth/auth.controller.js");

const productRoutes = require("../modules/products/products.routes");
const promotionRoutes = require("../modules/products/product-promotions/promotion.routes.js");
const cartRoutes = require("../modules/cart/cart.routes");
const orderRoutes = require("../modules/orders/orders.routes");
const userRoutes = require("../modules/users/users.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const adminDashboardRoutes = require("../modules/admin/routes/adminDashboard.routes");
const vendorRoutes = require("../modules/vendors/vendors.routes");
const uploadRoutes = require("../modules/upload/upload.routes");
const reviewRoutes = require("../modules/reviews/review.routes");
const messageRoutes = require("../modules/messages/message.routes");
const socketTestRoutes = require("./socket-test");
const sellerApplicationRoutes = require("./sellerApplication.routes");
const paymentRoutes = require("../modules/payments/payments.routes");
const locationRoutes = require("./location.routes");
const shopsRoutes = require("./shops.routes");
const commissionRoutes = require("../modules/commissions/commission.routes");
const notificationRoutes = require("../modules/notifications/notification.routes");
const walletRoutes = require("../modules/wallet/wallet.routes");
const subscriptionRoutes = require("../modules/subscription/subscription.route.js");
const vendorAnalyticsProRoutes = require("../modules/vendors/subcriptors/subscriptor.route.js");

const Banner = require("../modules/admin/models/banner.model");
const Category = require("../modules/admin/models/category.model");

const publicRoutes = require("./public.routes");

router.use("/public", publicRoutes);
router.use("/products", promotionRoutes);
router.use("/products", productRoutes);
router.use("/cart", protect, cartRoutes);
router.use("/order", orderRoutes);
router.use("/user", userRoutes);
router.use("/admin", protect, restrictTo("admin"), adminRoutes);
router.use("/admin/dashboard", adminDashboardRoutes);
router.use("/vendor", vendorRoutes);
router.use("/upload", uploadRoutes);
router.use("/reviews", reviewRoutes);
router.use("/messages", messageRoutes);
router.use("/socket-test", socketTestRoutes);
router.use("/api/seller", sellerApplicationRoutes);
router.use("/locations", locationRoutes);
router.use("/payments", paymentRoutes);
router.use("/api/shops", shopsRoutes);
router.use("/commissions", commissionRoutes);
router.use("/notifications", notificationRoutes);
router.use("/wallet", walletRoutes);
router.use(
  "/sellers/subscription",
  protect,
  restrictTo("vendor"),
  subscriptionRoutes,
);
router.use(
  "/plan/vendor/analytics",
  protect,
  restrictTo("vendor"),
  vendorAnalyticsProRoutes,
);

module.exports = router;
