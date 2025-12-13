/**
 * Debug endpoint to test promotion data for a specific product
 */
const express = require('express');
const Product = require('./modules/products/products.model');

const router = express.Router();

router.get('/debug/product/:productId/promotion', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId).lean();
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const response = {
      productId: product._id,
      productName: product.name,
      promotion: product.promotion,
      options: product.option?.map(opt => ({
        id: opt._id,
        label: opt.label,
        promotion: opt.promotion
      })) || []
    };
    
    console.log(`[DEBUG] Product ${productId} promotion data:`, JSON.stringify(response, null, 2));
    
    res.json(response);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;