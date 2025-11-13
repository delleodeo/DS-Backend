const express = require("express");
const router = express.Router();
const reviewController = require("./review.controller");
const { protect } = require("../../auth/auth.controller");

// Public routes
router.get("/product/:productId", reviewController.getProductReviews);
router.get("/product/:productId/stats", reviewController.getReviewStats);

// Protected routes (require authentication)
router.use(protect);

// Customer routes
router.post("/", reviewController.createReview);
router.get("/my-reviews", reviewController.getUserReviews);
router.get("/reviewable-products", reviewController.getReviewableProducts);
router.put("/:reviewId", reviewController.updateReview);
router.delete("/:reviewId", reviewController.deleteReview);
router.post("/:reviewId/helpful", reviewController.markReviewHelpful);

// Vendor routes
router.get("/vendor/:vendorId", reviewController.getVendorReviews);
router.post("/:reviewId/response", reviewController.addVendorResponse);

module.exports = router;
