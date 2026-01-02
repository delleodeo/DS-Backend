const express = require('express');
const router = express.Router();
const shopsController = require('../modules/shops/shops.controller');
const { protect, optionalProtect } = require('../auth/auth.controller');

// Public routes - get shops with location (no auth required, but optionalProtect for user context)
router.get('/with-location', optionalProtect, shopsController.getShopsWithLocation);

// Get nearby shops - requires coordinates
router.get('/nearby', optionalProtect, shopsController.getNearbyShops);

// Get single shop details
router.get('/:shopId', optionalProtect, shopsController.getShopDetails);

// Protected routes - vendor only
router.patch('/location', protect, shopsController.updateShopLocation);
router.delete('/location', protect, shopsController.removeShopLocation);

module.exports = router;
