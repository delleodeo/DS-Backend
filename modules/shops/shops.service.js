const Vendor = require('../vendors/vendors.model');
const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');

class ShopsService {
  /**
   * Get all shops that have location coordinates for map display
   * @returns {Array} Array of shops with location data
   */
  async getShopsWithLocation() {
    try {
      const shops = await Vendor.find({
        isApproved: true,
        location: { $exists: true },
        'location.coordinates': { $exists: true, $ne: [] }
      })
      .select('storeName description imageUrl address location rating numRatings followers')
      .lean();

      return shops.map(shop => ({
        _id: shop._id,
        storeName: shop.storeName,
        description: shop.description || '',
        imageUrl: shop.imageUrl || null,
        address: shop.address || {},
        location: shop.location,
        rating: shop.rating || 0,
        numRatings: shop.numRatings || 0,
        followersCount: shop.followers?.length || 0
      }));
    } catch (error) {
      console.error('Error fetching shops with location:', error);
      throw new Error('Failed to fetch shops with location');
    }
  }

  /**
   * Get nearby shops sorted by distance from user's location
   * @param {number} latitude - User's latitude
   * @param {number} longitude - User's longitude
   * @param {number} maxDistance - Maximum distance in meters (default: 50km)
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of shops sorted by distance
   */
  async getNearbyShops(latitude, longitude, maxDistance = 50000, limit = 50) {
    try {
      // Validate coordinates
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('Invalid coordinates provided');
      }
      
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Coordinates out of valid range');
      }

      const maxDist = Math.min(parseInt(maxDistance) || 50000, 1000000); // Cap at 1000km for wide-radius searches
      const resultLimit = Math.min(parseInt(limit) || 50, 100); // Cap at 100 results

      const shops = await Vendor.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [lng, lat] // GeoJSON uses [longitude, latitude]
            },
            distanceField: 'distance',
            maxDistance: maxDist,
            spherical: true,
            query: {
              isApproved: true,
              'location.coordinates': { $exists: true, $ne: [] }
            }
          }
        },
        {
          $project: {
            storeName: 1,
            description: 1,
            imageUrl: 1,
            address: 1,
            location: 1,
            rating: 1,
            numRatings: 1,
            followers: { $size: { $ifNull: ['$followers', []] } },
            distance: { $round: ['$distance', 0] } // Distance in meters
          }
        },
        {
          $limit: resultLimit
        }
      ]);

      return shops.map(shop => ({
        _id: shop._id,
        storeName: shop.storeName,
        description: shop.description || '',
        imageUrl: shop.imageUrl || null,
        address: shop.address || {},
        location: shop.location,
        rating: shop.rating || 0,
        numRatings: shop.numRatings || 0,
        followersCount: shop.followers || 0,
        distance: shop.distance, // in meters
        distanceText: this.formatDistance(shop.distance)
      }));
    } catch (error) {
      console.error('Error fetching nearby shops:', error);
      throw error;
    }
  }

  /**
   * Update vendor's shop location
   * @param {string} vendorId - Vendor's user ID
   * @param {number} latitude - Shop latitude
   * @param {number} longitude - Shop longitude
   */
  async updateShopLocation(userId, latitude, longitude) {
    try {
      // Validate and sanitize inputs
      const lat = parseFloat(sanitizeMongoInput(latitude));
      const lng = parseFloat(sanitizeMongoInput(longitude));

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('Invalid coordinates provided');
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Coordinates out of valid range');
      }

      const vendor = await Vendor.findOne({ userId });
      if (!vendor) {
        throw new Error('Vendor not found');
      }

      vendor.location = {
        type: 'Point',
        coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
      };

      await vendor.save();

      return {
        success: true,
        message: 'Shop location updated successfully',
        location: vendor.location
      };
    } catch (error) {
      console.error('Error updating shop location:', error);
      throw error;
    }
  }

  /**
   * Remove vendor's shop location
   * @param {string} userId - Vendor's user ID
   */
  async removeShopLocation(userId) {
    try {
      const vendor = await Vendor.findOne({ userId });
      if (!vendor) {
        throw new Error('Vendor not found');
      }

      vendor.location = undefined;
      await vendor.save();

      return {
        success: true,
        message: 'Shop location removed successfully'
      };
    } catch (error) {
      console.error('Error removing shop location:', error);
      throw error;
    }
  }

  /**
   * Get a single shop's details with location
   * @param {string} shopId - Shop/Vendor ID
   */
  async getShopDetails(shopId) {
    try {
      const shop = await Vendor.findById(sanitizeMongoInput(shopId))
        .select('storeName description imageUrl bannerUrl address location rating numRatings followers totalProducts')
        .lean();

      if (!shop) {
        throw new Error('Shop not found');
      }

      return {
        _id: shop._id,
        storeName: shop.storeName,
        description: shop.description || '',
        imageUrl: shop.imageUrl || null,
        bannerUrl: shop.bannerUrl || null,
        address: shop.address || {},
        location: shop.location || null,
        rating: shop.rating || 0,
        numRatings: shop.numRatings || 0,
        followersCount: shop.followers?.length || 0,
        totalProducts: shop.totalProducts || 0
      };
    } catch (error) {
      console.error('Error fetching shop details:', error);
      throw error;
    }
  }

  /**
   * Format distance to human-readable string
   * @param {number} meters - Distance in meters
   * @returns {string} Formatted distance
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }
}

module.exports = new ShopsService();
