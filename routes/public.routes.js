const express = require('express');
const router = express.Router();

// Models / services used by public endpoints
const Banner = require('../modules/admin/models/banner.model');
const Category = require('../modules/admin/models/category.model');
const productMetaService = require('../modules/products/productMeta.service');
const { Plan } = require('../modules/subscription/models/Plan.js');

// Public endpoint to get active banners for homepage
router.get('/public/banners', async (req, res) => {
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
        { startDate: null, endDate: { $gte: now } },
      ],
    }).sort({ displayOrder: 1 });
    res.json({ success: true, data: banners });
  } catch (error) {
    console.error('Get Public Banners Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Public endpoint to get active admin-managed categories for homepage filters
router.get('/categories', async (req, res) => {
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

// Product-based dynamic categories & municipalities (derived from approved products)
router.get('/product-categories', async (req, res) => {
  try {
    const categories = await productMetaService.getCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('Get Product Categories Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/product-municipalities', async (req, res) => {
  try {
    const municipalities = await productMetaService.getMunicipalities();
    res.json({ success: true, data: municipalities });
  } catch (err) {
    console.error('Get Product Municipalities Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public endpoint to get platform statistics for homepage
router.get('/stats', async (req, res) => {
  try {
    const User = require('../modules/users/users.model');
    const Product = require('../modules/products/products.model');
    const Order = require('../modules/orders/orders.model');

    const [totalUsers, totalProducts, totalOrders, totalSellers] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({ status: 'approved', isDisabled: { $ne: true } }),
      Order.countDocuments({ status: 'delivered' }),
      User.countDocuments({ role: 'vendor' }),
    ]);

    res.json({
      success: true,
      data: {
        users: totalUsers,
        products: totalProducts,
        orders: totalOrders,
        sellers: totalSellers,
      },
    });
  } catch (error) {
    console.error('Get Public Stats Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Public endpoint to get active subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .select('code name description price currency interval features limits discountExpiresAt discountPercent')
      .sort({ price: 1 });
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Get Public Plans Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
