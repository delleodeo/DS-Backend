# Payment Gateway - Quick Reference Card

## 🚀 Quick Start

### Environment Variables
```env
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_PUBLIC_KEY=pk_test_...
PAYMONGO_WEBHOOK_SECRET=whsec_...
PAYMENT_RETURN_URL=https://yourdomain.com/success
```

### Import in Your Code
```javascript
const paymentService = require('./modules/payments/payments.service');
const Payment = require('./modules/payments/payments.model');
```

---

## 📡 API Endpoints Cheat Sheet

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/payments/checkout` | User, Vendor | Create order payment |
| POST | `/api/payments/attach-method` | User, Vendor | Attach payment method |
| GET | `/api/payments/status/:id` | User, Vendor | Check status |
| POST | `/api/payments/refund` | Vendor, Admin | Create refund |
| POST | `/api/payments/cash-in` | User, Vendor | Wallet top-up |
| POST | `/api/payments/withdraw` | Vendor | Vendor payout |
| GET | `/api/payments/my-payments` | User, Vendor | Payment history |
| GET | `/api/payments/:id` | User, Vendor | Get details |
| POST | `/api/payments/cancel/:id` | User, Vendor | Cancel payment |
| POST | `/api/payments/webhook` | Public | Webhook handler |

---

## 💳 Payment Types

| Type | Purpose | Min Amount | Access |
|------|---------|------------|--------|
| `checkout` | Order payment | 100 PHP | User, Vendor |
| `refund` | Return funds | 1 PHP | Vendor, Admin |
| `cash_in` | Wallet top-up | 100 PHP | User, Vendor |
| `withdraw` | Vendor payout | 1,000 PHP | Vendor |

---

## 📊 Payment Statuses

```
pending → awaiting_payment → processing → succeeded
                                      ↓
                                   failed
                                      ↓
                                  cancelled
                                      ↓
                                  refunded
```

| Status | Description | Is Final? |
|--------|-------------|-----------|
| `pending` | Initial state | No |
| `awaiting_payment` | Waiting for user action | No |
| `processing` | Payment in progress | No |
| `succeeded` | Payment successful | Yes |
| `failed` | Payment failed | Yes |
| `cancelled` | Cancelled by user | Yes |
| `refunded` | Fully refunded | Yes |
| `partially_refunded` | Partial refund | No |
| `expired` | Payment expired | Yes |

---

## 🔐 Headers Required

```javascript
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

---

## 📝 Request Examples

### Checkout Payment
```javascript
POST /api/payments/checkout
{
  "orderId": "64abc123def456...",
  "amount": 50000,  // 500 PHP in centavos
  "description": "Order #12345"
}
```

### Attach Payment Method
```javascript
POST /api/payments/attach-method
{
  "paymentIntentId": "pi_abc123",
  "paymentMethodId": "pm_xyz456",
  "returnUrl": "https://yourdomain.com/success"
}
```

### Create Refund
```javascript
POST /api/payments/refund
{
  "paymentId": "64xyz789...",
  "amount": 25000,  // Partial: 250 PHP
  "reason": "Defective product"
}
```

### Cash-in
```javascript
POST /api/payments/cash-in
{
  "amount": 100000,  // 1000 PHP
  "paymentMethod": "gcash"
}
```

### Withdrawal
```javascript
POST /api/payments/withdraw
{
  "amount": 500000,  // 5000 PHP
  "bankAccount": {
    "accountNumber": "1234567890",
    "accountName": "Juan Dela Cruz",
    "bankName": "BPI"
  }
}
```

---

## ✅ Response Format

### Success
```javascript
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error
```javascript
{
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": ["Amount must be at least 100 PHP"],
    "timestamp": "2026-01-01T12:00:00.000Z"
  }
}
```

---

## 🎨 Service Layer Methods

```javascript
// Checkout payment
await paymentService.createCheckoutPayment(userId, orderId, amount, description);

// Attach payment method
await paymentService.attachPaymentMethod(userId, intentId, methodId, returnUrl);

// Check status
await paymentService.checkPaymentStatus(paymentIntentId);

// Create refund
await paymentService.createRefund(userId, paymentId, amount, reason);

// Cash-in
await paymentService.createCashIn(userId, amount, paymentMethod);

// Withdrawal
await paymentService.createWithdrawal(vendorId, amount, bankAccount);

// Get user payments
await paymentService.getUserPayments(userId, type, limit);

// Process webhook
await paymentService.processWebhook(payload, signature);
```

---

## 🗄️ Model Methods

### Instance Methods
```javascript
await payment.markAsSucceeded(gatewayData);
await payment.markAsFailed(reason, gatewayData);
await payment.markAsRefunded(refundData);
payment.canBeRefunded();  // Returns boolean
await payment.incrementRetry();
```

### Static Methods
```javascript
await Payment.findByIntent(paymentIntentId);
await Payment.findByOrder(orderId);
await Payment.findUserPayments(userId, type);
await Payment.getTotalRevenue(startDate, endDate);
```

---

## 🔍 Common Queries

```javascript
// Find succeeded payments
Payment.find({ status: 'succeeded' });

// Find user's checkout payments
Payment.find({ userId, type: 'checkout' });

// Find pending withdrawals
Payment.find({ type: 'withdraw', status: 'pending' });

// Find today's revenue
Payment.find({
  type: 'checkout',
  status: 'succeeded',
  paidAt: { $gte: new Date().setHours(0,0,0,0) }
});

// Find failed payments with reason
Payment.find({ 
  status: 'failed',
  failureReason: { $exists: true }
}).select('userId amount failureReason createdAt');
```

---

## ⚠️ Error Codes

| HTTP | Error Type | Description |
|------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 401 | `AUTHENTICATION_ERROR` | Not authenticated |
| 403 | `AUTHORIZATION_ERROR` | Access denied |
| 404 | `NOT_FOUND_ERROR` | Resource not found |
| 409 | `CONFLICT_ERROR` | Duplicate/conflict |
| 422 | `VALIDATION_ERROR` | Validation failed |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `EXTERNAL_SERVICE_ERROR` | PayMongo error |

---

## 🧪 Testing

```bash
# Run all tests
npm test test/payments.test.js

# Run specific test
npm test -- -t "createCheckoutPayment"

# With coverage
npm test -- --coverage test/payments.test.js

# Watch mode
npm test -- --watch test/payments.test.js
```

---

## 🐛 Debugging

### Check Payment Status
```javascript
const payment = await Payment.findById(paymentId);
console.log('Status:', payment.status);
console.log('Gateway Response:', payment.gatewayResponse);
```

### Check Logs
```javascript
// Logger automatically logs:
// - Payment creation
// - Status updates
// - Errors
// - Webhook events
```

### Manual Status Sync
```javascript
const payment = await paymentService.checkPaymentStatus(paymentIntentId);
```

---

## 💡 Pro Tips

### Amount Conversion
```javascript
// PHP to centavos
const centavos = php * 100;

// Centavos to PHP
const php = centavos / 100;
```

### Idempotency
```javascript
// Payments are automatically idempotent
// Same orderId + amount won't create duplicates
```

### Retry Logic
```javascript
// PayMongo client auto-retries 5xx errors
// Max 3 attempts with exponential backoff
```

### Webhook Reliability
```javascript
// Always return 200 to webhook
// Process async if needed
// PayMongo will retry failed webhooks
```

---

## 🔗 Related Resources

- Full Documentation: `README_PAYMENTS.md`
- Implementation Summary: `IMPLEMENTATION_SUMMARY.md`
- Tests: `test/payments.test.js`
- PayMongo Docs: https://developers.paymongo.com/

---

## 📞 Quick Help

**Issue:** Payment stuck in processing  
**Solution:** Check PayMongo dashboard or call `checkPaymentStatus()`

**Issue:** Webhook not working  
**Solution:** Verify signature and check logs

**Issue:** Refund failing  
**Solution:** Ensure original payment is `succeeded` status

**Issue:** Validation error  
**Solution:** Check amount is in centavos (multiply by 100)

---

**Last Updated:** January 1, 2026  
**Version:** 1.0.0
