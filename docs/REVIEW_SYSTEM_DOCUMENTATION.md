# Product Review System - Frontend Integration Guide

## Overview
The product review system allows customers to review products from their delivered orders. Features include:
- ⭐ Rate products (1-5 stars)
- 💬 Write detailed comments
- 📸 Upload review images
- 👍 Mark reviews as helpful
- 🏪 Vendor responses to reviews
- 📊 Review statistics and filtering

---

## API Endpoints

### Base URL
```
http://localhost:5000/v1/reviews
```

### Authentication
Most endpoints require JWT token in the Authorization header:
```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

---

## Customer Endpoints

### 1. Get Reviewable Products
**GET** `/reviews/reviewable-products`

Get all products from delivered orders that haven't been reviewed yet.

**Headers:** Requires authentication

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "orderId": "6915c234f00117b9a7a09811",
      "productId": "68f49f1298a695b5db60e5a0",
      "productName": "iPhone 15 Pro",
      "productImage": "https://example.com/image.jpg",
      "price": 1299.99,
      "quantity": 1,
      "orderDate": "2025-11-10T08:30:00.000Z",
      "vendorId": "68f487cd98a695b5db60e55d"
    }
  ]
}
```

**Example Usage:**
```javascript
const getReviewableProducts = async () => {
  try {
    const response = await fetch('http://localhost:5000/v1/reviews/reviewable-products', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    
    if (data.success) {
      console.log('Products to review:', data.data);
      // Display products that can be reviewed
      displayReviewableProducts(data.data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 2. Create Review
**POST** `/reviews`

Submit a new product review.

**Headers:** Requires authentication

**Body:**
```json
{
  "productId": "68f49f1298a695b5db60e5a0",
  "orderId": "6915c234f00117b9a7a09811",
  "rating": 5,
  "comment": "Excellent product! Fast delivery and great quality.",
  "images": [
    "https://example.com/review-photo1.jpg",
    "https://example.com/review-photo2.jpg"
  ]
}
```

**Validation:**
- `productId` (required): MongoDB ObjectId
- `orderId` (required): MongoDB ObjectId
- `rating` (required): Integer between 1-5
- `comment` (required): String, max 1000 characters
- `images` (optional): Array of image URLs

**Response:**
```json
{
  "success": true,
  "message": "Review created successfully",
  "data": {
    "_id": "691234567890abcdef123456",
    "productId": "68f49f1298a695b5db60e5a0",
    "userId": "68f123456789abcdef012345",
    "orderId": "6915c234f00117b9a7a09811",
    "vendorId": "68f487cd98a695b5db60e55d",
    "rating": 5,
    "comment": "Excellent product! Fast delivery and great quality.",
    "images": ["https://example.com/review-photo1.jpg"],
    "isVerifiedPurchase": true,
    "helpfulCount": 0,
    "createdAt": "2025-11-13T10:30:00.000Z"
  }
}
```

**Example Usage:**
```javascript
const submitReview = async (reviewData) => {
  try {
    const response = await fetch('http://localhost:5000/v1/reviews', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reviewData)
    });
    const data = await response.json();
    
    if (data.success) {
      console.log('Review submitted:', data.data);
      alert('Thank you for your review!');
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Example form submission
const handleSubmitReview = (e) => {
  e.preventDefault();
  submitReview({
    productId: selectedProduct.productId,
    orderId: selectedProduct.orderId,
    rating: selectedRating,
    comment: commentText,
    images: uploadedImageUrls
  });
};
```

---

### 3. Get My Reviews
**GET** `/reviews/my-reviews?page=1&limit=10`

Get all reviews written by the authenticated user.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 10

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "691234567890abcdef123456",
        "productId": {
          "_id": "68f49f1298a695b5db60e5a0",
          "name": "iPhone 15 Pro",
          "imageUrls": ["https://example.com/product.jpg"],
          "price": 1299.99
        },
        "rating": 5,
        "comment": "Excellent product!",
        "images": ["https://example.com/review.jpg"],
        "vendorResponse": {
          "comment": "Thank you for your review!",
          "respondedAt": "2025-11-13T11:00:00.000Z"
        },
        "helpfulCount": 15,
        "createdAt": "2025-11-13T10:30:00.000Z"
      }
    ],
    "total": 25,
    "page": 1,
    "totalPages": 3,
    "hasMore": true
  }
}
```

**Example Usage:**
```javascript
const getMyReviews = async (page = 1) => {
  try {
    const response = await fetch(`http://localhost:5000/v1/reviews/my-reviews?page=${page}&limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    
    if (data.success) {
      displayMyReviews(data.data.reviews);
      setupPagination(data.data.totalPages, data.data.page);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 4. Update Review
**PUT** `/reviews/:reviewId`

Update an existing review (only the review author can update).

**Headers:** Requires authentication

**Body:**
```json
{
  "rating": 4,
  "comment": "Updated review comment",
  "images": ["https://example.com/new-image.jpg"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "_id": "691234567890abcdef123456",
    "rating": 4,
    "comment": "Updated review comment",
    "images": ["https://example.com/new-image.jpg"],
    "updatedAt": "2025-11-13T12:00:00.000Z"
  }
}
```

**Example Usage:**
```javascript
const updateReview = async (reviewId, updates) => {
  try {
    const response = await fetch(`http://localhost:5000/v1/reviews/${reviewId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    
    if (data.success) {
      alert('Review updated successfully!');
      refreshReviews();
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 5. Delete Review
**DELETE** `/reviews/:reviewId`

Delete a review (only the review author can delete).

**Headers:** Requires authentication

**Response:**
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

**Example Usage:**
```javascript
const deleteReview = async (reviewId) => {
  if (!confirm('Are you sure you want to delete this review?')) return;
  
  try {
    const response = await fetch(`http://localhost:5000/v1/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    
    if (data.success) {
      alert('Review deleted successfully!');
      refreshReviews();
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 6. Mark Review as Helpful
**POST** `/reviews/:reviewId/helpful`

Mark or unmark a review as helpful. Toggle functionality - calling again removes the helpful mark.

**Headers:** Requires authentication

**Response:**
```json
{
  "success": true,
  "data": {
    "reviewId": "691234567890abcdef123456",
    "helpfulCount": 16,
    "isMarkedHelpful": true
  }
}
```

**Example Usage:**
```javascript
const toggleHelpful = async (reviewId) => {
  try {
    const response = await fetch(`http://localhost:5000/v1/reviews/${reviewId}/helpful`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    
    if (data.success) {
      updateHelpfulCount(reviewId, data.data.helpfulCount);
      updateHelpfulButton(reviewId, data.data.isMarkedHelpful);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

## Public Endpoints (No Authentication Required)

### 7. Get Product Reviews
**GET** `/reviews/product/:productId?page=1&limit=10&sortBy=createdAt`

Get all reviews for a specific product.

**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 10
- `sortBy` (optional): Sort by `createdAt`, `rating`, or `helpful`, default `createdAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "691234567890abcdef123456",
        "userId": {
          "_id": "68f123456789abcdef012345",
          "name": "John Doe",
          "imageUrl": "https://example.com/avatar.jpg"
        },
        "rating": 5,
        "comment": "Excellent product!",
        "images": ["https://example.com/review.jpg"],
        "vendorResponse": {
          "comment": "Thank you!",
          "respondedAt": "2025-11-13T11:00:00.000Z"
        },
        "helpfulCount": 15,
        "isVerifiedPurchase": true,
        "createdAt": "2025-11-13T10:30:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "totalPages": 5,
    "hasMore": true
  }
}
```

**Example Usage:**
```javascript
const getProductReviews = async (productId, page = 1, sortBy = 'createdAt') => {
  try {
    const response = await fetch(
      `http://localhost:5000/v1/reviews/product/${productId}?page=${page}&limit=10&sortBy=${sortBy}`
    );
    const data = await response.json();
    
    if (data.success) {
      displayReviews(data.data.reviews);
      setupPagination(data.data.totalPages, data.data.page);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Sort options
const sortOptions = ['createdAt', 'rating', 'helpful'];
```

---

### 8. Get Review Statistics
**GET** `/reviews/product/:productId/stats`

Get rating statistics for a product.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalReviews": 50,
    "averageRating": 4.5,
    "ratingDistribution": {
      "5": 30,
      "4": 15,
      "3": 3,
      "2": 1,
      "1": 1
    }
  }
}
```

**Example Usage:**
```javascript
const getReviewStats = async (productId) => {
  try {
    const response = await fetch(
      `http://localhost:5000/v1/reviews/product/${productId}/stats`
    );
    const data = await response.json();
    
    if (data.success) {
      displayRatingStars(data.data.averageRating);
      displayRatingDistribution(data.data.ratingDistribution);
      displayTotalReviews(data.data.totalReviews);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Example: Display rating distribution
const displayRatingDistribution = (distribution) => {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  
  Object.entries(distribution).forEach(([stars, count]) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    console.log(`${stars} stars: ${count} (${percentage.toFixed(1)}%)`);
  });
};
```

---

## Vendor Endpoints

### 9. Get Vendor Reviews
**GET** `/reviews/vendor/:vendorId?page=1&limit=10`

Get all reviews for a vendor's products.

**Headers:** Requires authentication

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "691234567890abcdef123456",
        "userId": {
          "_id": "68f123456789abcdef012345",
          "name": "John Doe",
          "imageUrl": "https://example.com/avatar.jpg"
        },
        "productId": {
          "_id": "68f49f1298a695b5db60e5a0",
          "name": "iPhone 15 Pro",
          "imageUrls": ["https://example.com/product.jpg"]
        },
        "rating": 5,
        "comment": "Excellent product!",
        "vendorResponse": null,
        "createdAt": "2025-11-13T10:30:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "totalPages": 10,
    "hasMore": true
  }
}
```

---

### 10. Add Vendor Response
**POST** `/reviews/:reviewId/response`

Vendor can respond to a review on their product.

**Headers:** Requires authentication (vendor account)

**Body:**
```json
{
  "responseComment": "Thank you for your purchase and review! We appreciate your feedback."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Response added successfully",
  "data": {
    "_id": "691234567890abcdef123456",
    "vendorResponse": {
      "comment": "Thank you for your purchase and review!",
      "respondedAt": "2025-11-13T12:00:00.000Z"
    }
  }
}
```

**Example Usage:**
```javascript
const addVendorResponse = async (reviewId, responseText) => {
  try {
    const response = await fetch(`http://localhost:5000/v1/reviews/${reviewId}/response`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vendorToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ responseComment: responseText })
    });
    const data = await response.json();
    
    if (data.success) {
      alert('Response added successfully!');
      refreshReviews();
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

## Complete React Component Example

```javascript
import React, { useState, useEffect } from 'react';

const ProductReviews = ({ productId }) => {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('createdAt');
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('authToken');

  // Fetch reviews
  useEffect(() => {
    fetchReviews();
    fetchStats();
  }, [productId, page, sortBy]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:5000/v1/reviews/product/${productId}?page=${page}&limit=10&sortBy=${sortBy}`
      );
      const data = await response.json();
      if (data.success) {
        setReviews(data.data.reviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `http://localhost:5000/v1/reviews/product/${productId}/stats`
      );
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleHelpful = async (reviewId) => {
    if (!token) {
      alert('Please login to mark reviews as helpful');
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5000/v1/reviews/${reviewId}/helpful`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (data.success) {
        fetchReviews(); // Refresh to show updated count
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="product-reviews">
      {/* Stats Section */}
      {stats && (
        <div className="review-stats">
          <h3>Customer Reviews</h3>
          <div className="rating-summary">
            <div className="average-rating">
              <span className="rating-number">{stats.averageRating}</span>
              <div className="stars">{'⭐'.repeat(Math.round(stats.averageRating))}</div>
              <span className="total-reviews">{stats.totalReviews} reviews</span>
            </div>
            <div className="rating-distribution">
              {Object.entries(stats.ratingDistribution).reverse().map(([stars, count]) => (
                <div key={stars} className="rating-bar">
                  <span>{stars} ⭐</span>
                  <div className="bar">
                    <div 
                      className="fill" 
                      style={{ width: `${(count / stats.totalReviews) * 100}%` }}
                    />
                  </div>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sort Options */}
      <div className="sort-options">
        <label>Sort by:</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="createdAt">Most Recent</option>
          <option value="rating">Highest Rating</option>
          <option value="helpful">Most Helpful</option>
        </select>
      </div>

      {/* Reviews List */}
      <div className="reviews-list">
        {loading ? (
          <p>Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p>No reviews yet. Be the first to review!</p>
        ) : (
          reviews.map((review) => (
            <div key={review._id} className="review-item">
              <div className="review-header">
                <img src={review.userId.imageUrl} alt={review.userId.name} />
                <div>
                  <h4>{review.userId.name}</h4>
                  <div className="stars">{'⭐'.repeat(review.rating)}</div>
                  <span className="date">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                  {review.isVerifiedPurchase && (
                    <span className="verified">✓ Verified Purchase</span>
                  )}
                </div>
              </div>
              
              <p className="review-comment">{review.comment}</p>
              
              {review.images && review.images.length > 0 && (
                <div className="review-images">
                  {review.images.map((img, idx) => (
                    <img key={idx} src={img} alt={`Review ${idx + 1}`} />
                  ))}
                </div>
              )}

              {review.vendorResponse && (
                <div className="vendor-response">
                  <strong>Vendor Response:</strong>
                  <p>{review.vendorResponse.comment}</p>
                  <span className="response-date">
                    {new Date(review.vendorResponse.respondedAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              <button 
                className="helpful-btn"
                onClick={() => handleHelpful(review._id)}
              >
                👍 Helpful ({review.helpfulCount})
              </button>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button 
          disabled={page === 1} 
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
};

export default ProductReviews;
```

---

## Review Form Component Example

```javascript
import React, { useState, useEffect } from 'react';

const ReviewForm = () => {
  const [reviewableProducts, setReviewableProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    fetchReviewableProducts();
  }, []);

  const fetchReviewableProducts = async () => {
    try {
      const response = await fetch(
        'http://localhost:5000/v1/reviews/reviewable-products',
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (data.success) {
        setReviewableProducts(data.data);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedProduct) {
      alert('Please select a product to review');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/v1/reviews', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: selectedProduct.productId,
          orderId: selectedProduct.orderId,
          rating,
          comment,
          images
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Review submitted successfully!');
        setSelectedProduct(null);
        setRating(5);
        setComment('');
        setImages([]);
        fetchReviewableProducts(); // Refresh list
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="review-form">
      <h2>Write a Review</h2>

      {reviewableProducts.length === 0 ? (
        <p>You have no products to review at this time.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Product Selection */}
          <div className="form-group">
            <label>Select Product:</label>
            <select 
              value={selectedProduct?.productId || ''}
              onChange={(e) => {
                const product = reviewableProducts.find(
                  p => p.productId === e.target.value
                );
                setSelectedProduct(product);
              }}
              required
            >
              <option value="">Choose a product...</option>
              {reviewableProducts.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.productName} - Order from {new Date(product.orderDate).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <>
              {/* Product Preview */}
              <div className="product-preview">
                <img src={selectedProduct.productImage} alt={selectedProduct.productName} />
                <div>
                  <h4>{selectedProduct.productName}</h4>
                  <p>Qty: {selectedProduct.quantity} | Price: ${selectedProduct.price}</p>
                </div>
              </div>

              {/* Rating */}
              <div className="form-group">
                <label>Rating:</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={star <= rating ? 'active' : ''}
                      onClick={() => setRating(star)}
                    >
                      ⭐
                    </span>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="form-group">
                <label>Your Review:</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your experience with this product..."
                  maxLength={1000}
                  rows={5}
                  required
                />
                <span className="char-count">{comment.length}/1000</span>
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Review'}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
};

export default ReviewForm;
```

---

## Error Handling

Common error responses:

```javascript
// 400 - Bad Request
{
  "success": false,
  "message": "Rating must be between 1 and 5"
}

// 400 - Duplicate Review
{
  "success": false,
  "message": "You have already reviewed this product"
}

// 400 - Order Not Delivered
{
  "success": false,
  "message": "You can only review products from delivered orders"
}

// 401 - Unauthorized
{
  "success": false,
  "message": "Authentication required"
}

// 404 - Not Found
{
  "success": false,
  "message": "Review not found"
}
```

---

## Best Practices

1. **Always check authentication** before making protected API calls
2. **Validate user input** before submitting reviews
3. **Handle loading states** to improve user experience
4. **Cache review data** to reduce API calls
5. **Show error messages** clearly to users
6. **Update UI optimistically** when possible
7. **Refresh product ratings** after review submission/update
8. **Implement pagination** for better performance
9. **Add image upload** functionality for review photos
10. **Show verified purchase badges** to build trust

---

## Testing Checklist

- ✅ Customer can see reviewable products
- ✅ Customer can submit a review with rating and comment
- ✅ Customer cannot review the same product twice
- ✅ Customer can only review delivered orders
- ✅ Customer can update their own review
- ✅ Customer can delete their own review
- ✅ Customer can mark reviews as helpful
- ✅ Product ratings update automatically
- ✅ Vendor can respond to reviews
- ✅ Public can view product reviews and statistics
- ✅ Pagination works correctly
- ✅ Sorting options work (recent, rating, helpful)

---

## Support

For issues or questions, check:
- Backend console logs for detailed error messages
- Network tab in browser DevTools
- Authentication token validity
- Order delivery status

Console logs will show:
```
✅ [REVIEW] Review created for product 68f49f1298a695b5db60e5a0 by user 68f123456789abcdef012345
✅ [REVIEW] Review updated by user 68f123456789abcdef012345
✅ [REVIEW] Vendor responded to review 691234567890abcdef123456
```
