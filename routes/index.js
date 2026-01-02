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

// Import Banner model for public banner endpoint
const Banner = require("../modules/admin/models/banner.model");
const Category = require("../modules/admin/models/category.model");

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Public endpoint to get active banners for homepage
router.get("/public/banners", async (req, res) => {
  try {
    const { placement = 'hero' } = req.query;
    const now = new Date();
    const banners = await Banner.find({
      placement,
      isActive: true,
      $or: [
        { startDate: null, endDate: null },
        { startDate: { $lte: now }, endDate: { $gte: now } },
        { startDate: { $lte: now }, endDate: null },
        { startDate: null, endDate: { $gte: now } }
      ]
    }).sort({ displayOrder: 1 });
    res.json({ success: true, data: banners });
  } catch (error) {
    console.error('Get Public Banners Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Public endpoint to get active categories for homepage filters
router.get("/public/categories", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .select('name slug description imageUrl iconName displayOrder level parentCategory')
      .sort({ displayOrder: 1, name: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Get Public Categories Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Public endpoint to get platform statistics for homepage
router.get("/public/stats", async (req, res) => {
  try {
    const User = require("../modules/users/users.model");
    const Product = require("../modules/products/products.model");
    const Order = require("../modules/orders/orders.model");
    
    const [totalUsers, totalProducts, totalOrders, totalSellers] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({ status: 'approved', isDisabled: { $ne: true } }),
      Order.countDocuments({ status: 'delivered' }),
      User.countDocuments({ role: 'vendor' })
    ]);
    
    res.json({
      success: true,
      data: {
        users: totalUsers,
        products: totalProducts,
        orders: totalOrders,
        sellers: totalSellers
      }
    });
  } catch (error) {
    console.error('Get Public Stats Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PROTECTED ROUTES
// ============================================

router.use("/products", promotionRoutes);  // Mount promotion routes FIRST to avoid conflicts
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

module.exports = router;
