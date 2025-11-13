const reviewService = require("./review.service");

// CREATE REVIEW
exports.createReview = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id; // JWT uses 'id' not '_id'
		const { productId, orderId, rating, comment, images } = req.body;

		if (!productId || !orderId || !rating || !comment) {
			return res.status(400).json({
				success: false,
				message: "Product ID, order ID, rating, and comment are required"
			});
		}

		if (rating < 1 || rating > 5) {
			return res.status(400).json({
				success: false,
				message: "Rating must be between 1 and 5"
			});
		}

		const review = await reviewService.createReviewService({
			productId,
			userId,
			orderId,
			rating,
			comment,
			images
		});

		res.status(201).json({
			success: true,
			message: "Review created successfully",
			data: review
		});
	} catch (error) {
		console.error("❌ [REVIEW CONTROLLER] Error creating review:", error.message);
		console.error("Stack:", error.stack);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to create review",
			error: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
};

// GET PRODUCT REVIEWS
exports.getProductReviews = async (req, res) => {
	try {
		const { productId } = req.params;
		const { page = 1, limit = 10, sortBy = "createdAt" } = req.query;

		const result = await reviewService.getProductReviewsService(
			productId,
			parseInt(page),
			parseInt(limit),
			sortBy
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("Error in getProductReviews:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get product reviews"
		});
	}
};

// GET USER REVIEWS
exports.getUserReviews = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { page = 1, limit = 10 } = req.query;

		const result = await reviewService.getUserReviewsService(
			userId,
			parseInt(page),
			parseInt(limit)
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("Error in getUserReviews:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get user reviews"
		});
	}
};

// GET VENDOR REVIEWS
exports.getVendorReviews = async (req, res) => {
	try {
		const { vendorId } = req.params;
		const { page = 1, limit = 10 } = req.query;

		const result = await reviewService.getVendorReviewsService(
			vendorId,
			parseInt(page),
			parseInt(limit)
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("Error in getVendorReviews:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get vendor reviews"
		});
	}
};

// UPDATE REVIEW
exports.updateReview = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { reviewId } = req.params;
		const { rating, comment, images } = req.body;

		const review = await reviewService.updateReviewService(
			reviewId,
			userId,
			{ rating, comment, images }
		);

		res.status(200).json({
			success: true,
			message: "Review updated successfully",
			data: review
		});
	} catch (error) {
		console.error("Error in updateReview:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to update review"
		});
	}
};

// DELETE REVIEW
exports.deleteReview = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { reviewId } = req.params;

		const result = await reviewService.deleteReviewService(reviewId, userId);

		res.status(200).json({
			success: true,
			message: result.message
		});
	} catch (error) {
		console.error("Error in deleteReview:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to delete review"
		});
	}
};

// VENDOR RESPONSE
exports.addVendorResponse = async (req, res) => {
	try {
		const vendorId = req.user.id || req.user._id;
		const { reviewId } = req.params;
		const { responseComment } = req.body;

		if (!responseComment) {
			return res.status(400).json({
				success: false,
				message: "Response comment is required"
			});
		}

		const review = await reviewService.addVendorResponseService(
			reviewId,
			vendorId,
			responseComment
		);

		res.status(200).json({
			success: true,
			message: "Response added successfully",
			data: review
		});
	} catch (error) {
		console.error("Error in addVendorResponse:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to add response"
		});
	}
};

// MARK REVIEW AS HELPFUL
exports.markReviewHelpful = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { reviewId } = req.params;

		const result = await reviewService.markReviewHelpfulService(reviewId, userId);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("Error in markReviewHelpful:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to mark review as helpful"
		});
	}
};

// GET REVIEWABLE PRODUCTS
exports.getReviewableProducts = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;

		const products = await reviewService.getReviewableProductsService(userId);

		res.status(200).json({
			success: true,
			data: products
		});
	} catch (error) {
		console.error("Error in getReviewableProducts:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get reviewable products"
		});
	}
};

// GET REVIEW STATISTICS
exports.getReviewStats = async (req, res) => {
	try {
		const { productId } = req.params;

		const stats = await reviewService.getReviewStatsService(productId);

		res.status(200).json({
			success: true,
			data: stats
		});
	} catch (error) {
		console.error("Error in getReviewStats:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get review statistics"
		});
	}
};
