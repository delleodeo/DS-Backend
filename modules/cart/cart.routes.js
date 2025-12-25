const express = require("express");
const router = express.Router();
const cartController = require("./cart.controller");
const { protect } = require("../../auth/auth.controller.js");
const verifyCartOwnership = require("../../middleware/verifyCartOwnership");
const rateLimiter = require("../../utils/rateLimiter");

// Apply authentication to all cart routes
router.use(protect);

// Apply rate limiting to cart operations (more restrictive than general API)
const cartRateLimiter = rateLimiter({
  windowSec: 60, // 1 minute
  maxRequests: 30, // 30 requests per minute for cart operations
  keyPrefix: "cart_rl"
});

// Apply cart ownership verification
router.use(verifyCartOwnership);

// Cart routes with validation and rate limiting
router.get("/", cartController.getCart);
router.post("/add", cartRateLimiter, cartController.addToCart);
router.put("/update", cartRateLimiter, cartController.updateCartItem);
router.delete("/remove", cartRateLimiter, cartController.removeCartItem);
router.delete("/clear", cartRateLimiter, cartController.clearCart);

module.exports = router;
