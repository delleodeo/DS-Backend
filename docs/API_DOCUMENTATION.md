# DS-Backend API Documentation

## Base URL
```
http://localhost:3002/v1
```

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Users API](#users-api)
4. [Products API](#products-api)
5. [Promotions API](#promotions-api)
6. [Cart API](#cart-api)
7. [Orders API](#orders-api)
8. [Vendors API](#vendors-api)
9. [Reviews API](#reviews-api)
10. [Messages API](#messages-api)
11. [Upload API](#upload-api)
12. [Seller Applications API](#seller-applications-api)
13. [Admin API](#admin-api)
14. [Response Codes](#response-codes)
15. [Error Handling](#error-handling)

---

## 📊 Overview

DS-Backend is a modular monolith e-commerce backend system with real-time features including:
- ✅ **Multi-vendor marketplace** with seller applications
- ✅ **Real-time messaging** via Socket.IO
- ✅ **Product promotions** with automatic expiration
- ✅ **Review system** with vendor responses
- ✅ **Revenue tracking** with monthly analytics
- ✅ **Commission management** for COD orders
- ✅ **Image management** with Cloudinary
- ✅ **OAuth authentication** (Google, Facebook)

---

## 🔐 Authentication

Most endpoints require authentication via Bearer token in the Authorization header.

```
Authorization: Bearer <your_token_here>
```

**User Roles:**
- `user` - Regular customer (can browse, purchase, review)
- `vendor` - Seller (can manage products, view orders, respond to reviews)
- `admin` - Administrator (full system access)

**Getting a Token:**
1. Register via `POST /v1/user/register`
2. Login via `POST /v1/user/login`
3. Use the returned JWT token in subsequent requests

---

## 👥 Users API

### Register User
**Endpoint:** `POST /v1/user/register`

**Authentication:** Not required

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

### Login User
**Endpoint:** `POST /v1/user/login`

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

### Get User Profile
**Endpoint:** `GET /v1/user/me`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "role": "user",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

### Update User Profile
**Endpoint:** `PUT /v1/user/me`

**Authentication:** Required

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phoneNumber": "+1234567891"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Smith",
    "phoneNumber": "+1234567891"
  }
}
```

---

### Logout User
**Endpoint:** `POST /v1/user/logout`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### OAuth Authentication
**Google Login:** `GET /v1/user/google`

**Facebook Login:** `GET /v1/user/facebook`

These endpoints redirect to respective OAuth providers for authentication.

---

## 🛍️ Products API

### Get All Products
**Endpoint:** `GET /v1/products`

**Authentication:** Not required

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `sort` (string: 'price', '-price', 'createdAt', '-createdAt')

**Success Response (200 OK):**
```json
{
  "success": true,
  "products": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Product Name",
      "description": "Product description",
      "price": 99.99,
      "category": "electronics",
      "vendor": "507f1f77bcf86cd799439012",
      "images": ["https://cloudinary.com/..."],
      "stock": 100,
      "isAvailable": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

### Get Product by ID
**Endpoint:** `GET /v1/products/:id`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Product Name",
    "description": "Product description",
    "price": 99.99,
    "category": "electronics",
    "vendor": {
      "_id": "507f1f77bcf86cd799439012",
      "storeName": "Tech Store"
    },
    "images": ["https://cloudinary.com/..."],
    "options": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Color: Red",
        "price": 99.99,
        "stock": 50
      }
    ],
    "stock": 100,
    "isAvailable": true,
    "reviews": [],
    "averageRating": 4.5
  }
}
```

---

### Create Product
**Endpoint:** `POST /v1/products`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "name": "New Product",
  "description": "Product description",
  "price": 99.99,
  "category": "electronics",
  "images": ["https://cloudinary.com/..."],
  "stock": 100,
  "municipality": "Quezon City"
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "New Product",
    "vendor": "507f1f77bcf86cd799439012",
    "status": "pending"
  }
}
```

---

### Update Product
**Endpoint:** `PUT /v1/products/:id`

**Authentication:** Required (Vendor/Admin - owner or admin)

**Request Body:**
```json
{
  "name": "Updated Product Name",
  "price": 89.99,
  "stock": 150
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Updated Product Name",
    "price": 89.99,
    "stock": 150
  }
}
```

---

### Delete Product
**Endpoint:** `DELETE /v1/products/:id`

**Authentication:** Required (Vendor/Admin - owner or admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

---

### Search Products
**Endpoint:** `GET /v1/products/search`

**Authentication:** Not required

**Query Parameters:**
- `q` (string, required) - Search query
- `category` (string, optional)
- `minPrice` (number, optional)
- `maxPrice` (number, optional)

**Success Response (200 OK):**
```json
{
  "success": true,
  "products": [...],
  "count": 25
}
```

---

### Get Products by Category
**Endpoint:** `GET /v1/products/category/:category`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "products": [...],
  "category": "electronics"
}
```

---

### Get Vendor Products
**Endpoint:** `GET /v1/products/vendor/:id`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "products": [...],
  "vendor": {
    "_id": "507f1f77bcf86cd799439012",
    "storeName": "Tech Store"
  }
}
```

---

### Add Product Option/Variant
**Endpoint:** `POST /v1/products/:productId/options`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "name": "Color: Blue",
  "price": 99.99,
  "stock": 30,
  "images": ["https://cloudinary.com/..."]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "options": [...]
  }
}
```

---

### Update Product Stock
**Endpoint:** `PATCH /v1/products/:productId/stock`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "quantity": 50,
  "operation": "add"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "product": {
    "stock": 150
  }
}
```

---

## 🎉 Promotions API

### Apply Promotion to Product
**Endpoint:** `POST /v1/products/:productId/promotion`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "discountType": "percentage",
  "discountValue": 20,
  "startDate": "2025-12-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z",
  "description": "Holiday Sale"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Promotion applied successfully",
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "promotion": {
      "discountType": "percentage",
      "discountValue": 20,
      "startDate": "2025-12-01T00:00:00.000Z",
      "endDate": "2025-12-31T23:59:59.999Z"
    }
  }
}
```

---

### Apply Promotion to Product Option
**Endpoint:** `POST /v1/products/:productId/option/:optionId/promotion`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "discountType": "fixed",
  "discountValue": 10,
  "startDate": "2025-12-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Promotion applied to option successfully",
  "product": {...}
}
```

---

### Remove Promotion from Product
**Endpoint:** `DELETE /v1/products/:productId/promotion`

**Authentication:** Required (Vendor/Admin)

**Success Response (200 OK):**
```json
{
  "message": "Promotion removed successfully",
  "product": {...}
}
```

---

### Get Active Promotions by Vendor
**Endpoint:** `GET /v1/products/vendor/:vendorId/promotions`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "promotions": [
    {
      "productId": "507f1f77bcf86cd799439011",
      "productName": "Product Name",
      "promotion": {
        "discountType": "percentage",
        "discountValue": 20
      }
    }
  ],
  "count": 5
}
```

---

## 🛒 Cart API

### Get Cart
**Endpoint:** `GET /v1/cart`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "cart": {
    "_id": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439012",
    "items": [
      {
        "product": {
          "_id": "507f1f77bcf86cd799439013",
          "name": "Product Name",
          "price": 99.99
        },
        "quantity": 2,
        "price": 99.99,
        "subtotal": 199.98
      }
    ],
    "totalItems": 2,
    "totalPrice": 199.98
  }
}
```

---

### Add to Cart
**Endpoint:** `POST /v1/cart/add`

**Authentication:** Required

**Request Body:**
```json
{
  "productId": "507f1f77bcf86cd799439013",
  "quantity": 2,
  "optionId": "507f1f77bcf86cd799439014"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "cart": {...}
}
```

---

### Update Cart Item
**Endpoint:** `PUT /v1/cart/update`

**Authentication:** Required

**Request Body:**
```json
{
  "productId": "507f1f77bcf86cd799439013",
  "quantity": 3
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "cart": {...}
}
```

---

### Remove Cart Item
**Endpoint:** `DELETE /v1/cart/remove`

**Authentication:** Required

**Request Body:**
```json
{
  "productId": "507f1f77bcf86cd799439013"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "cart": {...}
}
```

---

### Clear Cart
**Endpoint:** `DELETE /v1/cart/clear`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Cart cleared successfully"
}
```

---

## 📦 Orders API

### Create Order
**Endpoint:** `POST /v1/order`

**Authentication:** Required

**Request Body:**
```json
{
  "items": [
    {
      "product": "507f1f77bcf86cd799439013",
      "quantity": 2,
      "price": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Quezon City",
    "province": "Metro Manila",
    "postalCode": "1100",
    "country": "Philippines"
  },
  "paymentMethod": "COD",
  "totalAmount": 199.98
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "order": {
    "_id": "507f1f77bcf86cd799439015",
    "orderNumber": "ORD-20251215-001",
    "status": "pending",
    "totalAmount": 199.98
  }
}
```

---

### Get User Orders
**Endpoint:** `GET /v1/order`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "orders": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "orderNumber": "ORD-20251215-001",
      "status": "delivered",
      "totalAmount": 199.98,
      "createdAt": "2025-12-15T00:00:00.000Z"
    }
  ]
}
```

---

### Get Vendor Orders
**Endpoint:** `GET /v1/order/vendor`

**Authentication:** Required (Vendor/Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "orders": [...]
}
```

---

### Get Order by ID
**Endpoint:** `GET /v1/order/:id`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "order": {
    "_id": "507f1f77bcf86cd799439015",
    "orderNumber": "ORD-20251215-001",
    "user": {...},
    "vendor": {...},
    "items": [...],
    "status": "delivered",
    "totalAmount": 199.98,
    "shippingAddress": {...}
  }
}
```

---

### Update Order Status
**Endpoint:** `PATCH /v1/order/:orderId/status`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "status": "shipped"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "order": {
    "status": "shipped",
    "statusHistory": [...]
  }
}
```

---

### Cancel Order
**Endpoint:** `PUT /v1/order/cancel/:id`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "order": {
    "status": "cancelled"
  }
}
```

---

## 🏪 Vendors API

### Create Vendor
**Endpoint:** `POST /v1/vendor`

**Authentication:** Required (User/Admin)

**Request Body:**
```json
{
  "storeName": "My Tech Store",
  "description": "Best electronics in town",
  "contactEmail": "store@example.com",
  "contactPhone": "+1234567890",
  "address": {
    "street": "456 Market St",
    "city": "Quezon City",
    "province": "Metro Manila"
  }
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "vendor": {
    "_id": "507f1f77bcf86cd799439016",
    "storeName": "My Tech Store",
    "userId": "507f1f77bcf86cd799439012"
  }
}
```

---

### Get Vendor (Own Profile)
**Endpoint:** `GET /v1/vendor`

**Authentication:** Required (Vendor/Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "vendor": {
    "_id": "507f1f77bcf86cd799439016",
    "storeName": "My Tech Store",
    "totalRevenue": 10000,
    "totalOrders": 50,
    "monthlyRevenueComparison": [...],
    "followers": 100
  }
}
```

---

### Get Vendor Details
**Endpoint:** `GET /v1/vendor/:vendorId/details`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "vendor": {
    "_id": "507f1f77bcf86cd799439016",
    "storeName": "My Tech Store",
    "description": "Best electronics in town",
    "products": [...],
    "averageRating": 4.5,
    "followers": 100
  }
}
```

---

### Update Vendor
**Endpoint:** `PUT /v1/vendor`

**Authentication:** Required (Vendor/Admin)

**Request Body:**
```json
{
  "storeName": "Updated Store Name",
  "description": "New description"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "vendor": {...}
}
```

---

### Follow Vendor
**Endpoint:** `POST /v1/vendor/follow/:vendorId`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Vendor followed successfully"
}
```

---

### Get Featured Vendors
**Endpoint:** `GET /v1/vendor/featured`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "vendors": [...]
}
```

---

### Get Vendor Financials
**Endpoint:** `GET /v1/vendor/financials`

**Authentication:** Required (Vendor/Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "financials": {
    "totalRevenue": 10000,
    "monthlyRevenue": 2000,
    "pendingCommissions": 500,
    "totalOrders": 50
  }
}
```

---

### Reset Monthly Revenue
**Endpoint:** `POST /v1/vendor/reset-monthly-revenue`

**Authentication:** Required (Vendor/Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Current monthly revenue reset for December 2025",
  "data": [...]
}
```

---

### Batch Reset Monthly Revenue
**Endpoint:** `POST /v1/vendor/batch-reset-monthly-revenue`

**Authentication:** Required (Admin only)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Batch monthly revenue reset completed",
  "totalVendors": 50,
  "successCount": 50,
  "failedCount": 0
}
```

---

## ⭐ Reviews API

### Get Product Reviews
**Endpoint:** `GET /v1/reviews/product/:productId`

**Authentication:** Not required

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `sort` (string: 'recent', 'helpful', 'rating')

**Success Response (200 OK):**
```json
{
  "success": true,
  "reviews": [
    {
      "_id": "507f1f77bcf86cd799439017",
      "user": {
        "username": "john_doe"
      },
      "rating": 5,
      "comment": "Great product!",
      "helpful": 10,
      "vendorResponse": "Thank you!",
      "createdAt": "2025-12-15T00:00:00.000Z"
    }
  ]
}
```

---

### Get Review Stats
**Endpoint:** `GET /v1/reviews/product/:productId/stats`

**Authentication:** Not required

**Success Response (200 OK):**
```json
{
  "success": true,
  "stats": {
    "averageRating": 4.5,
    "totalReviews": 100,
    "ratingDistribution": {
      "5": 60,
      "4": 25,
      "3": 10,
      "2": 3,
      "1": 2
    }
  }
}
```

---

### Create Review
**Endpoint:** `POST /v1/reviews`

**Authentication:** Required

**Request Body:**
```json
{
  "product": "507f1f77bcf86cd799439013",
  "rating": 5,
  "comment": "Excellent product!",
  "images": ["https://cloudinary.com/..."]
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "review": {
    "_id": "507f1f77bcf86cd799439017",
    "rating": 5,
    "comment": "Excellent product!"
  }
}
```

---

### Update Review
**Endpoint:** `PUT /v1/reviews/:reviewId`

**Authentication:** Required (Owner only)

**Request Body:**
```json
{
  "rating": 4,
  "comment": "Updated review"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "review": {...}
}
```

---

### Delete Review
**Endpoint:** `DELETE /v1/reviews/:reviewId`

**Authentication:** Required (Owner only)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

---

### Add Vendor Response
**Endpoint:** `POST /v1/reviews/:reviewId/response`

**Authentication:** Required (Vendor)

**Request Body:**
```json
{
  "response": "Thank you for your feedback!"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "review": {
    "vendorResponse": "Thank you for your feedback!",
    "vendorRespondedAt": "2025-12-15T00:00:00.000Z"
  }
}
```

---

### Mark Review as Helpful
**Endpoint:** `POST /v1/reviews/:reviewId/helpful`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "review": {
    "helpful": 11
  }
}
```

---

## 💬 Messages API

### Get or Create Conversation
**Endpoint:** `POST /v1/messages/conversation`

**Authentication:** Required

**Request Body:**
```json
{
  "participantId": "507f1f77bcf86cd799439018"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "conversation": {
    "_id": "507f1f77bcf86cd799439019",
    "participants": [...],
    "lastMessage": {...}
  }
}
```

---

### Get User Conversations
**Endpoint:** `GET /v1/messages/conversations`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "conversations": [
    {
      "_id": "507f1f77bcf86cd799439019",
      "participants": [...],
      "lastMessage": {
        "content": "Hello!",
        "createdAt": "2025-12-15T00:00:00.000Z"
      },
      "unreadCount": 2
    }
  ]
}
```

---

### Send Message
**Endpoint:** `POST /v1/messages/send`

**Authentication:** Required

**Request Body:**
```json
{
  "conversationId": "507f1f77bcf86cd799439019",
  "content": "Hello, I have a question about this product",
  "attachments": ["https://cloudinary.com/..."]
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": {
    "_id": "507f1f77bcf86cd79943901a",
    "content": "Hello, I have a question about this product",
    "sender": "507f1f77bcf86cd799439012",
    "createdAt": "2025-12-15T00:00:00.000Z"
  }
}
```

---

### Get Conversation Messages
**Endpoint:** `GET /v1/messages/conversation/:conversationId/messages`

**Authentication:** Required

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50)

**Success Response (200 OK):**
```json
{
  "success": true,
  "messages": [...]
}
```

---

### Mark Messages as Read
**Endpoint:** `POST /v1/messages/conversation/:conversationId/read`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Messages marked as read"
}
```

---

### Get Unread Count
**Endpoint:** `GET /v1/messages/unread-count`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "unreadCount": 5
}
```

---

## 📤 Upload API

### Upload Images (Temporary)
**Endpoint:** `POST /v1/upload/temp`

**Authentication:** Not required

**Request Body:** `multipart/form-data`
- `images` (file array, max 10 files)

**Success Response (200 OK):**
```json
{
  "success": true,
  "images": [
    {
      "url": "https://res.cloudinary.com/...",
      "publicId": "temp/image123",
      "isTemp": true
    }
  ]
}
```

---

### Upload Images (Permanent)
**Endpoint:** `POST /v1/upload/permanent`

**Authentication:** Not required

**Request Body:** `multipart/form-data`
- `images` (file array, max 10 files)

**Success Response (200 OK):**
```json
{
  "success": true,
  "images": [
    {
      "url": "https://res.cloudinary.com/...",
      "publicId": "products/image123"
    }
  ]
}
```

---

### Confirm Temporary Images
**Endpoint:** `POST /v1/upload/confirm`

**Authentication:** Not required

**Request Body:**
```json
{
  "publicIds": ["temp/image123", "temp/image124"]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Images confirmed successfully"
}
```

---

### Delete Image
**Endpoint:** `DELETE /v1/upload/delete`

**Authentication:** Not required

**Request Body:**
```json
{
  "publicId": "products/image123"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

---

### Delete Batch Images
**Endpoint:** `DELETE /v1/upload/delete-batch`

**Authentication:** Not required

**Request Body:**
```json
{
  "publicIds": ["products/image123", "products/image124"]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Images deleted successfully",
  "deleted": 2
}
```

---

## 📋 Seller Applications API

### Get Application Status
**Endpoint:** `GET /v1/seller/status`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "application": {
    "status": "pending",
    "submittedAt": "2025-12-15T00:00:00.000Z",
    "documents": {
      "governmentId": "uploaded",
      "birTin": "uploaded",
      "dtiOrSec": "uploaded"
    }
  }
}
```

---

### Submit Application
**Endpoint:** `POST /v1/seller/apply`

**Authentication:** Required

**Request Body:** `multipart/form-data`
- `storeName` (string)
- `storeDescription` (string)
- `contactEmail` (string)
- `contactPhone` (string)
- `governmentId` (file)
- `birTin` (file)
- `dtiOrSec` (file)

**Success Response (201 Created):**
```json
{
  "success": true,
  "application": {
    "status": "pending",
    "submittedAt": "2025-12-15T00:00:00.000Z"
  }
}
```

---

### Cancel Application
**Endpoint:** `DELETE /v1/seller/cancel`

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Application cancelled and documents deleted"
}
```

---

### Get Pending Applications (Admin)
**Endpoint:** `GET /v1/seller/admin/pending`

**Authentication:** Required (Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "applications": [
    {
      "userId": "507f1f77bcf86cd799439012",
      "storeName": "My Store",
      "status": "pending",
      "submittedAt": "2025-12-15T00:00:00.000Z"
    }
  ]
}
```

---

### Review Application (Admin)
**Endpoint:** `PUT /v1/seller/admin/review/:userId`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "action": "approve",
  "rejectionReason": "Optional reason if rejecting"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Application approved",
  "user": {
    "role": "vendor"
  }
}
```

---

## 🔧 Admin API

### Get Dashboard Stats
**Endpoint:** `GET /v1/admin/dashboard/stats`

**Authentication:** Required (Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "stats": {
    "totalUsers": 1000,
    "totalVendors": 50,
    "totalProducts": 500,
    "totalOrders": 2000,
    "totalRevenue": 100000,
    "todayOrders": 50,
    "todayRevenue": 5000
  }
}
```

---

### Get All Users
**Endpoint:** `GET /v1/admin/dashboard/users`

**Authentication:** Required (Admin)

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `role` (string: 'user', 'vendor', 'admin')
- `status` (string: 'active', 'restricted')

**Success Response (200 OK):**
```json
{
  "success": true,
  "users": [...],
  "pagination": {...}
}
```

---

### Restrict/Unrestrict User
**Endpoint:** `POST /v1/admin/dashboard/users/:userId/restrict`

**Endpoint:** `POST /v1/admin/dashboard/users/:userId/unrestrict`

**Authentication:** Required (Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "User restricted successfully",
  "user": {...}
}
```

---

### Get All Products (Admin)
**Endpoint:** `GET /v1/admin/dashboard/products`

**Authentication:** Required (Admin)

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string: 'pending', 'approved', 'rejected')

**Success Response (200 OK):**
```json
{
  "success": true,
  "products": [...],
  "pagination": {...}
}
```

---

### Approve/Reject Product
**Endpoint:** `POST /v1/admin/dashboard/products/:productId/approve`

**Endpoint:** `POST /v1/admin/dashboard/products/:productId/reject`

**Authentication:** Required (Admin)

**Request Body (for reject):**
```json
{
  "reason": "Does not meet quality standards"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Product approved",
  "product": {
    "status": "approved"
  }
}
```

---

### Get Commission Report
**Endpoint:** `GET /v1/admin/dashboard/commission/report`

**Authentication:** Required (Admin)

**Query Parameters:**
- `startDate` (ISO date string)
- `endDate` (ISO date string)
- `vendorId` (optional)

**Success Response (200 OK):**
```json
{
  "success": true,
  "report": {
    "totalCommission": 5000,
    "collectedCommission": 3000,
    "pendingCommission": 2000,
    "orders": [...]
  }
}
```

---

### Get Pending COD Commissions
**Endpoint:** `GET /v1/admin/dashboard/commission/pending-cod`

**Authentication:** Required (Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "pendingCommissions": [
    {
      "orderId": "507f1f77bcf86cd799439015",
      "vendor": {...},
      "amount": 100,
      "commissionDue": 10,
      "dueDate": "2025-12-31T00:00:00.000Z"
    }
  ]
}
```

---

### Collect COD Commission
**Endpoint:** `POST /v1/admin/dashboard/commission/:orderId/collect`

**Authentication:** Required (Admin)

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Commission collected",
  "order": {...}
}
```

---

### Create/Update Category
**Endpoint:** `POST /v1/admin/dashboard/categories`

**Endpoint:** `PUT /v1/admin/dashboard/categories/:categoryId`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "name": "Electronics",
  "description": "Electronic devices and accessories",
  "icon": "electronics-icon.png",
  "isActive": true
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "category": {...}
}
```

---

### Create/Update Banner
**Endpoint:** `POST /v1/admin/dashboard/banners`

**Endpoint:** `PUT /v1/admin/dashboard/banners/:bannerId`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "title": "Holiday Sale",
  "image": "https://cloudinary.com/...",
  "link": "/products/sale",
  "isActive": true,
  "startDate": "2025-12-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "banner": {...}
}
```

---

### Update System Settings
**Endpoint:** `PUT /v1/admin/dashboard/settings`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "maintenanceMode": false,
  "commissionRate": 10,
  "minOrderAmount": 100
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "settings": {...}
}
```

---

---

## 🔄 Response Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request or validation error |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate entry) |
| 500 | Internal Server Error | Server error occurred |

---

## 🐛 Error Handling

### Standard Error Response Format

All errors follow this consistent format:

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": {
    "field": "fieldName",
    "message": "Specific field error"
  }
}
```

### Common Error Examples

#### 1. Authentication Required
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```
**Solution:** Include valid Bearer token in Authorization header

#### 2. Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "email": "Email is required",
    "password": "Password must be at least 8 characters"
  }
}
```
**Solution:** Check request body and fix validation errors

#### 3. Insufficient Permissions
```json
{
  "success": false,
  "error": "Access denied. Admin role required.",
  "code": "FORBIDDEN"
}
```
**Solution:** Use appropriate user role or contact administrator

#### 4. Resource Not Found
```json
{
  "success": false,
  "error": "Product not found",
  "code": "NOT_FOUND"
}
```
**Solution:** Verify the resource ID exists

#### 5. Duplicate Entry
```json
{
  "success": false,
  "error": "Email already exists",
  "code": "DUPLICATE_ENTRY"
}
```
**Solution:** Use a different value for unique fields

---

## 💰 Monthly Revenue Tracking

### Overview

**Real-Time Revenue Tracking:**
- ✅ Revenue is **automatically pushed** to `monthlyRevenueComparison` on **every sale**
- ✅ Each order completion immediately updates the current month and year
- ✅ No waiting for month-end - revenue tracking is instant
- ✅ `currentMonthlyRevenue` tracks running total (optional reset at month start)

**Flow:**
```
Order Completed → Revenue Added to monthlyRevenueComparison[CurrentMonth][CurrentYear]
```

### Automatic Revenue Tracking (On Each Sale)

**Scenario:** Customer completes an order for $5,000

```javascript
// This happens automatically in orders.service.js
// When order status is set to "delivered"

Order Status → "delivered"
    ↓
updateVendorRevenue(vendorId, 5000) is called
    ↓
// Automatically updates:
- monthlyRevenueComparison[November][2025] += 5000
- currentMonthlyRevenue += 5000
- totalRevenue += 5000
- totalOrders += 1
    ↓
Vendor document saved
```

**Result:**
```json
{
  "monthlyRevenueComparison": [
    {
      "year": 2025,
      "revenues": {
        "November": 80000
      }
    }
  ],
  "currentMonthlyRevenue": 80000,
  "totalRevenue": 485000
}
```

### Monthly Revenue Data Structure

```javascript
{
  "userId": "ObjectId",              // Reference to User
  "storeName": "String",             // Vendor store name
  "currentMonthlyRevenue": "Number", // Current month running total
  "totalRevenue": "Number",          // All-time total revenue
  "totalOrders": "Number",           // Total completed orders
  "monthlyRevenueComparison": [      // Historical monthly data (UPDATED IN REAL-TIME)
    {
      "year": "Number",              // e.g., 2025
      "revenues": {
        "January": "Number",
        "February": "Number",
        "March": "Number",
        "April": "Number",
        "May": "Number",
        "June": "Number",
        "July": "Number",
        "August": "Number",
        "September": "Number",
        "October": "Number",
        "November": "Number",
        "December": "Number"
      }
    }
  ]
}
```

### Monthly Reset (Optional - Automatic via Cron)

The system includes an optional cron job that resets `currentMonthlyRevenue` at 12:01 AM on the 1st of each month.

**Cron Expression:** `"1 0 1 * *"`

**Console Output:**
```
✅ Monthly revenue cron job started - resets currentMonthlyRevenue on 1st of each month
[2025-12-01T00:01:00.000Z] Starting monthly revenue reset for new month...
[2025-12-01T00:01:05.000Z] Monthly revenue reset completed: {
  success: true,
  totalVendors: 50,
  successCount: 50,
  failedCount: 0
}
```

---

## 🌐 Real-Time Features (Socket.IO)

### WebSocket Connection

**Endpoint:** `ws://localhost:3002/socket.io/`

**Connection Example:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3002', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Real-Time Events

#### New Message Event
```javascript
socket.on('newMessage', (message) => {
  console.log('New message:', message);
  // Update UI with new message
});
```

#### Order Status Update Event
```javascript
socket.on('orderStatusUpdate', (order) => {
  console.log('Order status changed:', order);
  // Update UI with order status
});
```

#### Send Message
```javascript
socket.emit('sendMessage', {
  conversationId: '507f1f77bcf86cd799439019',
  content: 'Hello!',
  receiverId: '507f1f77bcf86cd799439018'
});
```

---

## 🔄 Automatic Processing & Cron Jobs

### 1. Monthly Revenue Reset
- **Schedule:** 12:01 AM on the 1st of each month
- **Action:** Resets `currentMonthlyRevenue` for all vendors
- **Cron:** `1 0 1 * *`

### 2. Image Cleanup
- **Schedule:** Daily at 2:00 AM
- **Action:** Deletes temporary images older than 24 hours
- **Cron:** `0 2 * * *`

### 3. Promotion Expiration
- **Schedule:** Every hour
- **Action:** Automatically removes expired promotions
- **Cron:** `0 * * * *`

---

## 🧪 Testing

### Testing with cURL

#### Login and Get Token
```bash
curl -X POST http://localhost:3002/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

#### Get Products
```bash
curl -X GET http://localhost:3002/v1/products
```

#### Create Product (Authenticated)
```bash
curl -X POST http://localhost:3002/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Product",
    "price":99.99,
    "category":"electronics",
    "stock":100
  }'
```

### Testing with Postman

A Postman collection is available in `/docs/Postman_Collection.json` with pre-configured requests for all endpoints.

**Import Instructions:**
1. Open Postman
2. Click Import
3. Select `/docs/Postman_Collection.json`
4. Update environment variables (BASE_URL, TOKEN)

---

## 📚 Additional Resources

### Related Documentation
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Visual Flow Diagram](./VISUAL_FLOW_DIAGRAM.md)
- [Messaging System Documentation](./MESSAGING_SYSTEM_DOCUMENTATION.md)
- [Review System Documentation](./REVIEW_SYSTEM_DOCUMENTATION.md)
- [Revenue Tracking](../README_REVENUE_TRACKING.md)
- [Docker Setup](../README.Docker.md)

### Data Models
For detailed schema definitions, refer to the respective model files in `/modules/*/models/`

### Environment Variables
Required environment variables:
- `PORT` - Server port (default: 3002)
- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `FACEBOOK_APP_ID` - Facebook OAuth app ID
- `FACEBOOK_APP_SECRET` - Facebook OAuth secret

---

## 📞 Support & Contact

For issues, questions, or contributions:
1. Check server logs for error messages
2. Verify MongoDB and Redis connections
3. Ensure proper authentication headers
4. Review request body format
5. Check API endpoint paths

**Common Issues:**
- **401 Unauthorized:** Token expired or invalid - login again
- **403 Forbidden:** Insufficient permissions - check user role
- **404 Not Found:** Invalid endpoint or resource ID
- **500 Server Error:** Check server logs and database connection

---

## 📝 Changelog & Version History

### Version 1.0.0 (Current)
- Complete REST API implementation
- Real-time messaging with Socket.IO
- Multi-vendor support
- Review and rating system
- Promotion management
- Revenue tracking
- Admin dashboard
- Seller application system

---

**Last Updated:** December 2025

**API Version:** 1.0.0

**Backend Framework:** Node.js + Express.js

**Database:** MongoDB + Redis
