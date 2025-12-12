const express = require('express');
const router = express.Router();
const {
  applyPromotionToProduct,
  applyPromotionToOption,
  removePromotionFromProduct,
  removePromotionFromOption,
  getActivePromotionsByVendor,
} = require('./promotion.service.js');

/**
 * Apply promotion to product
 * POST /api/products/:productId/promotion
 */
router.post('/:productId/promotion', async (req, res) => {
  try {
    const { productId } = req.params;
    const promotionData = req.body;
    
    const product = await applyPromotionToProduct(productId, promotionData);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ 
      message: 'Promotion applied successfully', 
      product 
    });
  } catch (error) {
    console.error('Apply promotion error:', error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * Apply promotion to product option
 * POST /api/products/:productId/option/:optionId/promotion
 */
router.post('/:productId/option/:optionId/promotion', async (req, res) => {
  try {
    const { productId, optionId } = req.params;
    const promotionData = req.body;
    
    const product = await applyPromotionToOption(productId, optionId, promotionData);
    
    if (!product) {
      return res.status(404).json({ message: 'Product or option not found' });
    }
    
    res.json({ 
      message: 'Promotion applied to option successfully', 
      product 
    });
  } catch (error) {
    console.error('Apply option promotion error:', error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * Remove promotion from product
 * DELETE /api/products/:productId/promotion
 */
router.delete('/:productId/promotion', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await removePromotionFromProduct(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ 
      message: 'Promotion removed successfully', 
      product 
    });
  } catch (error) {
    console.error('Remove promotion error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Remove promotion from product option
 * DELETE /api/products/:productId/option/:optionId/promotion
 */
router.delete('/:productId/option/:optionId/promotion', async (req, res) => {
  try {
    const { productId, optionId } = req.params;
    
    const product = await removePromotionFromOption(productId, optionId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product or option not found' });
    }
    
    res.json({ 
      message: 'Promotion removed from option successfully', 
      product 
    });
  } catch (error) {
    console.error('Remove option promotion error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get active promotions for vendor
 * GET /api/products/vendor/:vendorId/promotions
 */
router.get('/vendor/:vendorId/promotions', async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const promotions = await getActivePromotionsByVendor(vendorId);
    
    res.json({ 
      promotions,
      count: promotions.length
    });
  } catch (error) {
    console.error('Get vendor promotions error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
