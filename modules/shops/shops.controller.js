const shopsService = require('./shops.service');
const { ValidationError, formatErrorResponse } = require('../../utils/errorHandler');

class ShopsController {
  /**
   * Get all shops with location for map display
   * GET /api/shops/with-location
   */
  async getShopsWithLocation(req, res) {
    try {
      const shops = await shopsService.getShopsWithLocation();
      
      res.json({
        success: true,
        count: shops.length,
        shops
      });
    } catch (error) {
      console.error('Get shops with location error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch shops with location'
      });
    }
  }

  /**
   * Get nearby shops sorted by distance
   * GET /api/shops/nearby?lat=&lng=&maxDistance=&limit=
   */
  async getNearbyShops(req, res) {
    try {
      const { lat, lng, maxDistance, limit } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const shops = await shopsService.getNearbyShops(lat, lng, maxDistance, limit);

      res.json({
        success: true,
        count: shops.length,
        userLocation: {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng)
        },
        shops
      });
    } catch (error) {
      console.error('Get nearby shops error:', error);
      
      if (error.message.includes('Invalid coordinates') || error.message.includes('out of valid range')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch nearby shops'
      });
    }
  }

  /**
   * Update vendor's shop location
   * PATCH /api/shops/location
   */
  async updateShopLocation(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const { latitude, longitude } = req.body;

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const result = await shopsService.updateShopLocation(userId, latitude, longitude);
      res.json(result);
    } catch (error) {
      console.error('Update shop location error:', error);

      if (error.message.includes('Invalid coordinates') || 
          error.message.includes('out of valid range') ||
          error.message === 'Vendor not found') {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update shop location'
      });
    }
  }

  /**
   * Remove vendor's shop location
   * DELETE /api/shops/location
   */
  async removeShopLocation(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const result = await shopsService.removeShopLocation(userId);
      res.json(result);
    } catch (error) {
      console.error('Remove shop location error:', error);

      if (error.message === 'Vendor not found') {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to remove shop location'
      });
    }
  }

  /**
   * Get single shop details
   * GET /api/shops/:shopId
   */
  async getShopDetails(req, res) {
    try {
      const { shopId } = req.params;

      if (!shopId) {
        return res.status(400).json({
          success: false,
          error: 'Shop ID is required'
        });
      }

      const shop = await shopsService.getShopDetails(shopId);

      res.json({
        success: true,
        shop
      });
    } catch (error) {
      console.error('Get shop details error:', error);

      if (error.message === 'Shop not found') {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch shop details'
      });
    }
  }
}

module.exports = new ShopsController();
