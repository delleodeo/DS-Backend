const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {
  applyPromotionToProduct,
  applyPromotionToOption,
  removePromotionFromProduct,
  removePromotionFromOption,
  getActivePromotionsByVendor,
  getPromotionStatus,
} = require('./promotion.service.js');

/**
 * Validate MongoDB ObjectId
 */
function validateObjectId(id, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${fieldName}: ${id}`);
  }
}

/**
 * Apply promotion to product
 * POST /api/products/:productId/promotion
 */
router.post('/:productId/promotion', async (req, res) => {
  try {
    const { productId } = req.params;
    const promotionData = req.body;
    
    // Validate productId
    validateObjectId(productId, 'productId');
    
    // Validate required promotion fields
    if (!promotionData.discountType) {
      return res.status(400).json({ message: 'discountType is required' });
    }
    
    if (promotionData.discountValue === undefined || promotionData.discountValue === null) {
      return res.status(400).json({ message: 'discountValue is required' });
    }
    
    console.log(`[Promotion] Applying promotion to product ${productId}:`, promotionData);
    
    const product = await applyPromotionToProduct(productId, promotionData);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log(`[Promotion] Successfully applied promotion to product ${productId}`);
    
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
    
    console.log(`[Promotion] Route hit: POST /products/${productId}/option/${optionId}/promotion`);
    console.log(`[Promotion] Request body:`, promotionData);
    
    // Validate productId and optionId
    validateObjectId(productId, 'productId');
    validateObjectId(optionId, 'optionId');
    
    // Validate required promotion fields
    if (!promotionData.discountType) {
      return res.status(400).json({ message: 'discountType is required' });
    }
    
    if (promotionData.discountValue === undefined || promotionData.discountValue === null) {
      return res.status(400).json({ message: 'discountValue is required' });
    }
    
    console.log(`[Promotion] Applying promotion to option ${optionId} of product ${productId}`);
    
    const product = await applyPromotionToOption(productId, optionId, promotionData);
    
    if (!product) {
      console.log(`[Promotion] Product or option not found: productId=${productId}, optionId=${optionId}`);
      return res.status(404).json({ message: 'Product or option not found' });
    }
    
    console.log(`[Promotion] Successfully applied promotion to option ${optionId}`);
    
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
    
    // Validate productId
    validateObjectId(productId, 'productId');
    
    console.log(`[Promotion] Removing promotion from product ${productId}`);
    
    const product = await removePromotionFromProduct(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log(`[Promotion] Successfully removed promotion from product ${productId}`);
    
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
    
    // Validate productId and optionId
    validateObjectId(productId, 'productId');
    validateObjectId(optionId, 'optionId');
    
    console.log(`[Promotion] Removing promotion from option ${optionId} of product ${productId}`);
    
    const product = await removePromotionFromOption(productId, optionId);
    
    if (!product) {
      console.log(`[Promotion] Product or option not found: productId=${productId}, optionId=${optionId}`);
      return res.status(404).json({ message: 'Product or option not found' });
    }
    
    console.log(`[Promotion] Successfully removed promotion from option ${optionId}`);
    
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
    
    console.log(`[Promotion Routes] GET /vendor/${vendorId}/promotions`);
    
    const promotions = await getActivePromotionsByVendor(vendorId);
    
    console.log(`[Promotion Routes] Returning ${promotions.length} promotions`);
    
    res.json({ 
      promotions,
      count: promotions.length
    });
  } catch (error) {
    console.error('Get vendor promotions error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get promotion status for a product or specific option
 * GET /api/products/:productId/promotion/status
 * GET /api/products/:productId/option/:optionId/promotion/status
 */
router.get('/:productId/promotion/status', async (req, res) => {
  try {
    const { productId } = req.params;
    validateObjectId(productId, 'productId');
    
    const status = await getPromotionStatus(productId);
    res.json(status);
  } catch (error) {
    console.error('Get promotion status error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:productId/option/:optionId/promotion/status', async (req, res) => {
  try {
    const { productId, optionId } = req.params;
    validateObjectId(productId, 'productId');
    validateObjectId(optionId, 'optionId');
    
    const status = await getPromotionStatus(productId, optionId);
    res.json(status);
  } catch (error) {
    console.error('Get option promotion status error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
