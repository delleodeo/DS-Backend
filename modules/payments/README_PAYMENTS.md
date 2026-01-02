# Payment Gateway Implementation

## 📋 Overview

This is a comprehensive, production-ready payment gateway system built for the DSHOP e-commerce platform. It supports multiple payment operations: **Order Checkout**, **Refunds**, **Vendor Withdrawals**, and **Wallet Cash-in**.

### Key Features
- ✅ **Secure Authentication & Authorization** - All endpoints protected with JWT
- ✅ **PayMongo Integration** - Full API client with retry logic
- ✅ **Comprehensive Error Handling** - Using custom error classes
- ✅ **Input Validation** - Express-validator for all inputs
- ✅ **Database Transactions** - Proper MongoDB operations
- ✅ **Webhook Support** - Signature verification included
- ✅ **Unit Tests** - Jest tests for all layers
- ✅ **Clean Architecture** - Model → Service → Controller → Routes

---

## 🏗️ Architecture

```
payments/
├── payments.model.js      # Mongoose schema with validations
├── payments.service.js    # Business logic layer
├── payments.controller.js # HTTP request handlers
└── payments.routes.js     # Express routes with auth

utils/
└── paymongoClient.js      # PayMongo API abstraction

validators/
└── payment.validator.js   # Input validation rules

test/
└── payments.test.js       # Jest unit tests
```

---

## 📊 Database Schema

### Payment Model

```javascript
{
  userId: ObjectId,              // User making/receiving payment
  orderId: ObjectId,             // Associated order (optional)
  type: "checkout|refund|withdraw|cash_in",
  provider: "paymongo|gcash|wallet|cod|bank_transfer",
  
  // Gateway References
  paymentIntentId: String,
  paymentMethodId: String,
  chargeId: String,
  refundId: String,
  
  // Transaction Amounts (in centavos)
  amount: Number,
  fee: Number,
  netAmount: Number,
  currency: "PHP",
  
  // Status Tracking
  status: "pending|processing|awaiting_payment|succeeded|failed|cancelled|refunded|partially_refunded|expired",
  
  // Additional Data
  description: String,
  metadata: Map,
  failureReason: String,
  
  // Idempotency & Security
  isFinal: Boolean,
  idempotencyKey: String,
  retryCount: Number,
  
  // Webhook Data
  webhookReceived: Boolean,
  webhookData: Object,
  gatewayResponse: Object,
  
  // Bank Details (for withdrawals)
  bankAccount: {
    accountNumber: String,
    accountName: String,
    bankName: String
  },
  
  // Timestamps
  paidAt: Date,
  refundedAt: Date,
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes
- `userId + type + status` - User payment queries
- `orderId + status` - Order payment lookup
- `paymentIntentId` - Gateway reconciliation
- `createdAt` - Chronological queries
- `type + status + createdAt` - Analytics

---

## 🔐 API Endpoints

### 1. Create Checkout Payment

**POST** `/api/payments/checkout`

**Auth:** User, Vendor

**Body:**
```json
{
  "orderId": "64abc123...",
  "amount": 50000,
  "description": "Order #12345",
  "metadata": {
    "items": "Product A, Product B"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "paymentId": "64xyz...",
    "paymentIntentId": "pi_abc123",
    "clientKey": "pk_test_abc123",
    "amount": 50000,
    "currency": "PHP",
    "status": "awaiting_payment"
  }
}
```

---

### 2. Attach Payment Method

**POST** `/api/payments/attach-method`

**Auth:** User, Vendor

**Body:**
```json
{
  "paymentIntentId": "pi_abc123",
  "paymentMethodId": "pm_xyz456",
  "returnUrl": "https://yourdomain.com/payment-success"
}
```

---

### 3. Check Payment Status

**GET** `/api/payments/status/:paymentIntentId`

**Auth:** User, Vendor, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "64xyz...",
    "status": "succeeded",
    "amount": 50000,
    "paidAt": "2026-01-01T12:00:00.000Z",
    "isFinal": true
  }
}
```

---

### 4. Create Refund

**POST** `/api/payments/refund`

**Auth:** Vendor, Admin

**Body:**
```json
{
  "paymentId": "64xyz...",
  "amount": 50000,
  "reason": "Customer request",
  "metadata": {
    "notes": "Defective product"
  }
}
```

---

### 5. Create Cash-in (Wallet Top-up)

**POST** `/api/payments/cash-in`

**Auth:** User, Vendor

**Body:**
```json
{
  "amount": 100000,
  "paymentMethod": "gcash"
}
```

**Validation:**
- Minimum: 100 PHP (10,000 centavos)
- Maximum: 100,000 PHP (10,000,000 centavos)

---

### 6. Create Withdrawal

**POST** `/api/payments/withdraw`

**Auth:** Vendor only

**Body:**
```json
{
  "amount": 500000,
  "bankAccount": {
    "accountNumber": "1234567890",
    "accountName": "Juan Dela Cruz",
    "bankName": "BPI"
  }
}
```

**Validation:**
- Minimum: 1,000 PHP (100,000 centavos)
- Complete bank details required

---

### 7. Get My Payments

**GET** `/api/payments/my-payments?type=checkout&limit=50`

**Auth:** User, Vendor

**Query Params:**
- `type` (optional): `checkout`, `refund`, `withdraw`, `cash_in`
- `limit` (optional): 1-100 (default: 50)

---

### 8. Get Payment by ID

**GET** `/api/payments/:id`

**Auth:** User, Vendor, Admin (ownership verified)

---

### 9. Cancel Payment

**POST** `/api/payments/cancel/:paymentIntentId`

**Auth:** User, Vendor

**Body:**
```json
{
  "reason": "Changed mind"
}
```

---

### 10. Webhook Handler

**POST** `/api/payments/webhook`

**Auth:** Public (signature verified)

**Headers:**
```
paymongo-signature: sha256=abc123...
```

**Events Handled:**
- `payment.paid`
- `payment.failed`
- `payment.refunded`

---

## 🔒 Security Features

### 1. Authentication & Authorization
```javascript
// All routes protected except webhook
router.use(protect);

// Role-based access control
router.post("/refund", restrictTo("vendor", "admin"), ...);
router.post("/withdraw", restrictTo("vendor"), ...);
```

### 2. Input Validation
```javascript
// Express-validator rules
validateCheckoutPayment: [
  body("amount").isInt({ min: 10000 }),
  body("orderId").isMongoId(),
  // ... more rules
]
```

### 3. Input Sanitization
```javascript
// NoSQL injection protection
const sanitizedAmount = sanitizeMongoInput(amount);
const sanitizedDescription = sanitizeMongoInput(description);
```

### 4. Webhook Signature Verification
```javascript
verifyWebhookSignature(payload, signature) {
  const computedSignature = crypto
    .createHmac("sha256", this.webhookSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
  return computedSignature === signature;
}
```

### 5. Ownership Verification
```javascript
if (payment.userId.toString() !== userId.toString()) {
  throw new ValidationError("Payment does not belong to this user");
}
```

---

## ⚡ Performance Optimizations

### 1. Database Indexes
- Compound indexes for common queries
- Sparse indexes for optional fields
- Covering indexes for list queries

### 2. Retry Logic
```javascript
// Automatic retry on 5xx errors
if (response.status >= 500 && retryCount < maxRetries) {
  await delay(retryDelay * (retryCount + 1));
  return this.request(endpoint, options, retryCount + 1);
}
```

### 3. Connection Pooling
- Reusable fetch client
- Singleton PayMongo client instance

---

## 🧪 Testing

### Run Tests
```bash
# Run all payment tests
npm test test/payments.test.js

# Run with coverage
npm test -- --coverage test/payments.test.js

# Watch mode
npm test -- --watch test/payments.test.js
```

### Test Coverage
- ✅ Model validation & methods
- ✅ Service layer business logic
- ✅ All payment operations (checkout, refund, withdraw, cash-in)
- ✅ Error scenarios
- ✅ Edge cases

---

## 📝 Environment Variables

Add to `.env`:
```env
# PayMongo API Keys
PAYMONGO_SECRET_KEY=sk_test_your_secret_key
PAYMONGO_PUBLIC_KEY=pk_test_your_public_key
PAYMONGO_WEBHOOK_SECRET=whsec_your_webhook_secret

# Payment URLs
PAYMENT_RETURN_URL=https://yourdomain.com/payment-success

# Database
MONGO_URI=mongodb://localhost:27017/dshop
MONGO_TEST_URI=mongodb://localhost:27017/dshop_test
```

---

## 🚀 Usage Examples

### Frontend Integration

```javascript
// 1. Create checkout payment
const response = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: '64abc123...',
    amount: 50000,
    description: 'Order #12345'
  })
});

const { data } = await response.json();
const { clientKey, paymentIntentId } = data;

// 2. Attach payment method (using PayMongo.js SDK)
const paymentMethod = await paymongoClient.createPaymentMethod({
  type: 'gcash',
  billing: { ... }
});

await fetch('/api/payments/attach-method', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentIntentId,
    paymentMethodId: paymentMethod.id,
    returnUrl: window.location.origin + '/payment-success'
  })
});

// 3. Check status periodically
const checkStatus = setInterval(async () => {
  const res = await fetch(`/api/payments/status/${paymentIntentId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { data } = await res.json();
  
  if (data.status === 'succeeded') {
    clearInterval(checkStatus);
    showSuccessMessage();
  }
}, 3000);
```

---

## 🛠️ Maintenance & Monitoring

### Logging
All payment operations are logged:
```javascript
logger.info("Checkout payment created:", {
  paymentId: payment._id,
  orderId,
  amount: sanitizedAmount,
});
```

### Error Tracking
Errors include context:
```javascript
logger.error("Error creating checkout payment:", {
  userId,
  orderId,
  amount,
  error: error.message,
  stack: error.stack
});
```

### Health Checks
Monitor these metrics:
- Payment success rate
- Average processing time
- Refund rate
- Failed payment reasons
- Webhook delivery success

### Database Queries for Analytics
```javascript
// Total revenue
const revenue = await Payment.getTotalRevenue(startDate, endDate);

// Failed payments
const failed = await Payment.find({
  status: 'failed',
  createdAt: { $gte: startDate }
});

// Pending withdrawals
const pendingWithdrawals = await Payment.find({
  type: 'withdraw',
  status: 'pending'
});
```

---

## 🐛 Troubleshooting

### Common Issues

**1. Webhook not receiving events**
- Check PayMongo dashboard webhook configuration
- Verify webhook URL is publicly accessible
- Check signature verification logs

**2. Payment stuck in processing**
- Check PayMongo dashboard for payment status
- Manually trigger status check: `GET /api/payments/status/:id`
- Check webhook logs

**3. Refund failing**
- Verify original payment status is "succeeded"
- Check refund amount doesn't exceed original
- Verify PayMongo payment ID exists

**4. Validation errors**
- Check amount is in centavos (multiply PHP by 100)
- Verify all required fields are present
- Check data types match schema

---

## 📚 Additional Resources

- [PayMongo API Documentation](https://developers.paymongo.com/)
- [Express Validator Docs](https://express-validator.github.io/)
- [Mongoose Documentation](https://mongoosejs.com/)
- [Jest Testing Framework](https://jestjs.io/)

---

## 👥 Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review error messages in response
3. Check PayMongo dashboard
4. Contact development team

---

## 📄 License

Proprietary - DSHOP E-commerce Platform

---

**Last Updated:** January 1, 2026  
**Version:** 1.0.0  
**Maintainer:** Engineering Team
