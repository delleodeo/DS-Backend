const Review = require("./review.model");
const Order = require("../orders/orders.model");
const Product = require("../products/products.model");
const Vendor = require("../vendors/vendors.model");
const { getRedisClient, isRedisAvailable } = require("../../config/redis");
const redisClient = getRedisClient();

// Helper function to update product rating
const updateProductRating = async (productId) => {
  try {
    const reviews = await Review.find({ productId, isVisible: true });

    if (reviews.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        numReviews: 0,
      });
      return { averageRating: 0, numReviews: 0 };
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;

    await Product.findByIdAndUpdate(productId, {
      averageRating: parseFloat(averageRating.toFixed(2)),
      numReviews: reviews.length,
    });

    // Clear product cache
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await safeDel(`product:${productId}`);
      // Use pattern delete for wildcard product cache
      const CacheUtils = require('../products/product-utils/cacheUtils');
      const cache = new CacheUtils(redisClient);
      await cache.deletePattern('products:*');
    }

    return {
      averageRating: parseFloat(averageRating.toFixed(2)),
      numReviews: reviews.length,
    };
  } catch (error) {
    console.error("Error updating product rating:", error);
    throw error;
  }
};

// CREATE REVIEW
exports.createReviewService = async (reviewData) => {
  try {
    const { productId, userId, orderId, rating, comment, images } = reviewData;

    console.log("🔍 [REVIEW] Creating review with data:", {
      productId,
      userId,
      orderId,
      rating,
      hasComment: !!comment,
    });

    // Verify order exists and is delivered
    const order = await Order.findById(orderId);

    if (!order) throw new Error("Order not found");

    if (order.status !== "delivered") {
      console.error("❌ [REVIEW] Order not delivered. Status:", order.status);
      throw new Error("You can only review products from delivered orders");
    }

    // Check if customerId exists
    if (!order.customerId) {
      console.error("❌ [REVIEW] Order missing customerId:", order);
      throw new Error("Order data is incomplete (missing customer)");
    }

    if (order.customerId.toString() !== userId.toString()) {
      console.error(
        "❌ [REVIEW] User mismatch. Order customer:",
        order.customerId,
        "Review user:",
        userId
      );
      throw new Error("You can only review your own orders");
    }

    // Verify product is in the order
    const orderItem = order.items.find(
      (item) =>
        item.productId && item.productId.toString() === productId.toString()
    );

    if (!orderItem) {
      console.error(
        "❌ [REVIEW] Product not in order. Looking for:",
        productId,
        "Order items:",
        order.items.map((i) => i.productId)
      );
      throw new Error("Product not found in this order");
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ orderId, productId, userId });

    if (existingReview) {
      console.warn("⚠️ [REVIEW] Duplicate review attempt");
      throw new Error("You have already reviewed this product");
    }

    // Get vendor ID from order
    const vendorId = order.vendorId;

    if (!vendorId) {
      console.error("❌ [REVIEW] Order missing vendorId");
      throw new Error("Order data is incomplete (missing vendor)");
    }

    const vendor = await Vendor.findOneAndUpdate({userId: vendorId});
	
    if (!vendor) throw new Error("Vendor not found for this order");

    // Update vendor rating and count
    const newNumRatings = (vendor.numRatings || 0) + 1;
    const newAverageRating = (vendor.rating || 0) + rating;

    vendor.numRatings = newNumRatings;
    vendor.rating = parseFloat(newAverageRating.toFixed(2));

    console.log("vendor:", vendor);

    if (!vendor) throw new Error("Vendor not found for this order");

    // Create review
    const review = new Review({
      productId,
      userId,
      orderId,
      vendorId,
      rating,
      comment,
      images: images || [],
      isVerifiedPurchase: true,
    });

    const savedReview = await review.save();
    await vendor.save();

    // Update product rating
    await updateProductRating(productId);

    // Clear caches
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await Promise.all([
        safeDel(`reviews:product:${productId}`),
        safeDel(`reviews:user:${userId}`),
        safeDel(`reviews:vendor:${vendorId}`),
        safeDel(`vendor:${vendorId}`),
      ]);
    }

    console.log(
      `✅ [REVIEW] Review created for product ${productId} by user ${userId}`
    );

    return savedReview.toObject();
  } catch (error) {
    console.error("Error creating review:", error);
    throw error;
  }
};

// GET PRODUCT REVIEWS
exports.getProductReviewsService = async (
  productId,
  page = 1,
  limit = 10,
  sortBy = "createdAt"
) => {
  try {
    const skip = (page - 1) * limit;

    const sortOptions = {
      createdAt: { createdAt: -1 },
      rating: { rating: -1 },
      helpful: { helpfulCount: -1 },
    };

    const sort = sortOptions[sortBy] || sortOptions.createdAt;

    const reviews = await Review.find({ productId, isVisible: true })
      .populate("userId", "name imageUrl")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Review.countDocuments({ productId, isVisible: true });

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + reviews.length < total,
    };
  } catch (error) {
    console.error("Error getting product reviews:", error);
    throw error;
  }
};

// GET USER REVIEWS
exports.getUserReviewsService = async (userId, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ userId })
      .populate("productId", "name imageUrls price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Review.countDocuments({ userId });

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + reviews.length < total,
    };
  } catch (error) {
    console.error("Error getting user reviews:", error);
    throw error;
  }
};

// GET VENDOR REVIEWS
exports.getVendorReviewsService = async (vendorId, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ vendorId, isVisible: true })
      .populate("userId", "name imageUrl")
      .populate("productId", "name imageUrls")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Review.countDocuments({ vendorId, isVisible: true });

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + reviews.length < total,
    };
  } catch (error) {
    console.error("Error getting vendor reviews:", error);
    throw error;
  }
};

// UPDATE REVIEW
exports.updateReviewService = async (reviewId, userId, updateData) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.userId.toString() !== userId.toString()) {
      throw new Error("You can only update your own reviews");
    }

    // Only allow updating rating, comment, and images
    if (updateData.rating !== undefined) review.rating = updateData.rating;
    if (updateData.comment !== undefined) review.comment = updateData.comment;
    if (updateData.images !== undefined) review.images = updateData.images;

    const updatedReview = await review.save();

    // Update product rating
    await updateProductRating(review.productId);

    // Clear caches
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await Promise.all([
        safeDel(`reviews:product:${review.productId}`),
        safeDel(`reviews:user:${userId}`),
        safeDel(`reviews:vendor:${review.vendorId}`),
      ]);
    }

    console.log(`✅ [REVIEW] Review ${reviewId} updated by user ${userId}`);

    return updatedReview.toObject();
  } catch (error) {
    console.error("Error updating review:", error);
    throw error;
  }
};

// DELETE REVIEW
exports.deleteReviewService = async (reviewId, userId) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.userId.toString() !== userId.toString()) {
      throw new Error("You can only delete your own reviews");
    }

    const productId = review.productId;
    const vendorId = review.vendorId;

    await Review.findByIdAndDelete(reviewId);

    // Update product rating
    await updateProductRating(productId);

    // Clear caches
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await Promise.all([
        safeDel(`reviews:product:${productId}`),
        safeDel(`reviews:user:${userId}`),
        safeDel(`reviews:vendor:${vendorId}`),
      ]);
    }

    console.log(`✅ [REVIEW] Review ${reviewId} deleted by user ${userId}`);

    return { message: "Review deleted successfully" };
  } catch (error) {
    console.error("Error deleting review:", error);
    throw error;
  }
};

// VENDOR RESPONSE
exports.addVendorResponseService = async (
  reviewId,
  vendorId,
  responseComment
) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.vendorId.toString() !== vendorId.toString()) {
      throw new Error("You can only respond to reviews on your products");
    }

    review.vendorResponse = {
      comment: responseComment,
      respondedAt: new Date(),
    };

    const updatedReview = await review.save();

    // Clear caches
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await safeDel(`reviews:product:${review.productId}`);
      await safeDel(`reviews:vendor:${vendorId}`);
    }

    console.log(
      `✅ [REVIEW] Vendor ${vendorId} responded to review ${reviewId}`
    );

    return updatedReview.toObject();
  } catch (error) {
    console.error("Error adding vendor response:", error);
    throw error;
  }
};

// MARK REVIEW AS HELPFUL
exports.markReviewHelpfulService = async (reviewId, userId) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new Error("Review not found");
    }

    const alreadyMarked = review.helpfulBy.some(
      (id) => id.toString() === userId.toString()
    );

    if (alreadyMarked) {
      // Remove helpful mark
      review.helpfulBy = review.helpfulBy.filter(
        (id) => id.toString() !== userId.toString()
      );
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      // Add helpful mark
      review.helpfulBy.push(userId);
      review.helpfulCount += 1;
    }

    const updatedReview = await review.save();

    // Clear cache
    if (isRedisAvailable()) {
      const { safeDel } = require('../../config/redis');
      await safeDel(`reviews:product:${review.productId}`);
    }

    return {
      reviewId,
      helpfulCount: updatedReview.helpfulCount,
      isMarkedHelpful: !alreadyMarked,
    };
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    throw error;
  }
};

// GET REVIEWABLE PRODUCTS (products from delivered orders that haven't been reviewed)
exports.getReviewableProductsService = async (userId) => {
  try {
    // Get all delivered orders for the user
    const deliveredOrders = await Order.find({
      customerId: userId,
      status: "delivered",
    })
      .select("_id items vendorId createdAt")
      .lean();

    // Get all reviews by this user
    const userReviews = await Review.find({ userId })
      .select("productId orderId")
      .lean();

    // Create a set of reviewed product-order combinations
    const reviewedSet = new Set(
      userReviews.map((r) => `${r.orderId}_${r.productId}`)
    );

    // Collect reviewable products
    const reviewableProducts = [];

    for (const order of deliveredOrders) {
      for (const item of order.items) {
        const key = `${order._id}_${item.productId}`;

        if (!reviewedSet.has(key) && item.productId) {
          // Get product details
          const product = await Product.findById(item.productId)
            .select("name imageUrls price vendorId")
            .lean();

          if (product) {
            reviewableProducts.push({
              orderId: order._id,
              productId: item.productId,
              productName: product.name || item.name,
              productImage: product.imageUrls?.[0] || item.imgUrl,
              price: item.price,
              quantity: item.quantity,
              orderDate: order.createdAt,
              vendorId: order.vendorId,
            });
          }
        }
      }
    }

    // Sort by order date (most recent first)
    reviewableProducts.sort((a, b) => b.orderDate - a.orderDate);

    return reviewableProducts;
  } catch (error) {
    console.error("Error getting reviewable products:", error);
    throw error;
  }
};

// GET REVIEW STATISTICS
exports.getReviewStatsService = async (productId) => {
  try {
    const reviews = await Review.find({ productId, isVisible: true }).lean();

    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0,
        },
      };
    }

    const ratingDistribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    reviews.forEach((review) => {
      ratingDistribution[review.rating]++;
    });

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;

    return {
      totalReviews: reviews.length,
      averageRating: parseFloat(averageRating.toFixed(2)),
      ratingDistribution,
    };
  } catch (error) {
    console.error("Error getting review stats:", error);
    throw error;
  }
};
