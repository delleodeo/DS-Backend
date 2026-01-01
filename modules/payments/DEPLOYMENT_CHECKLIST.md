# Payment Gateway Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Environment Configuration
- [ ] Set `PAYMONGO_SECRET_KEY` in production `.env`
- [ ] Set `PAYMONGO_PUBLIC_KEY` in production `.env`
- [ ] Set `PAYMONGO_WEBHOOK_SECRET` in production `.env`
- [ ] Set `PAYMENT_RETURN_URL` to production domain
- [ ] Verify `NODE_ENV=production`
- [ ] Verify database connection string is production MongoDB
- [ ] Remove any test/development keys

### 2. PayMongo Dashboard Setup
- [ ] Create production PayMongo account
- [ ] Get production API keys (not test keys)
- [ ] Configure webhook URL: `https://yourdomain.com/api/payments/webhook`
- [ ] Enable webhook events:
  - `payment.paid`
  - `payment.failed`
  - `payment.refunded`
- [ ] Save webhook signing secret
- [ ] Test webhook delivery in dashboard

### 3. Database
- [ ] Run database indexes creation (automatic with Mongoose)
- [ ] Verify MongoDB connection
- [ ] Set up database backups
- [ ] Configure database monitoring
- [ ] Optional: Drop old `payments` collection if migrating

### 4. Code Verification
- [ ] All tests passing: `npm test test/payments.test.js`
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets or keys
- [ ] Error handling in all controllers
- [ ] Authentication middleware on protected routes
- [ ] Validation on all endpoints

### 5. Security Audit
- [ ] JWT authentication working
- [ ] Role-based authorization tested
- [ ] Input validation on all endpoints
- [ ] NoSQL injection protection (sanitizeMongoInput)
- [ ] Webhook signature verification enabled
- [ ] Ownership checks in place
- [ ] No sensitive data in responses
- [ ] HTTPS enabled on server

### 6. Testing
- [ ] Unit tests: `npm test test/payments.test.js`
- [ ] Test checkout flow end-to-end
- [ ] Test refund flow
- [ ] Test cash-in flow
- [ ] Test withdrawal flow
- [ ] Test webhook reception
- [ ] Test error scenarios
- [ ] Load testing (optional)

### 7. Integration Testing
- [ ] Test with real PayMongo test mode first
- [ ] Verify order updates when payment succeeds
- [ ] Test payment cancellation
- [ ] Test duplicate payment prevention
- [ ] Test refund limits
- [ ] Test amount validations

### 8. Monitoring Setup
- [ ] Configure logging (Winston/Bunyan)
- [ ] Set up error tracking (Sentry/Rollbar)
- [ ] Configure APM (New Relic/DataDog)
- [ ] Set up alerts for failed payments
- [ ] Set up alerts for webhook failures
- [ ] Dashboard for payment monitoring

### 9. Documentation
- [ ] README_PAYMENTS.md reviewed
- [ ] API documentation shared with frontend team
- [ ] Postman collection created
- [ ] Environment variables documented
- [ ] Webhook setup documented

### 10. Backup & Recovery
- [ ] Database backup strategy
- [ ] Transaction logs enabled
- [ ] Rollback plan documented
- [ ] Incident response plan

---

## 🚀 Deployment Steps

### Step 1: Pre-Production Testing
```bash
# 1. Run all tests
npm test test/payments.test.js

# 2. Check for linting errors
npm run lint

# 3. Build application
npm run build  # If applicable
```

### Step 2: Environment Setup
```bash
# 1. Set environment variables on server
export PAYMONGO_SECRET_KEY="sk_live_..."
export PAYMONGO_PUBLIC_KEY="pk_live_..."
export PAYMONGO_WEBHOOK_SECRET="whsec_..."
export PAYMENT_RETURN_URL="https://yourdomain.com/payment-success"
export NODE_ENV="production"

# 2. Verify variables
echo $PAYMONGO_SECRET_KEY
```

### Step 3: Deploy Code
```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm ci --production

# 3. Restart server
pm2 restart app  # or your process manager
```

### Step 4: Verify Deployment
```bash
# 1. Check server is running
curl https://yourdomain.com/health

# 2. Test authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://yourdomain.com/api/payments/my-payments

# 3. Check logs
tail -f logs/app.log
```

### Step 5: PayMongo Configuration
1. Log in to PayMongo Dashboard
2. Go to Developers → Webhooks
3. Add webhook:
   - URL: `https://yourdomain.com/api/payments/webhook`
   - Events: Select all payment events
4. Copy webhook secret to `.env`
5. Test webhook delivery

### Step 6: Smoke Testing
```bash
# Test checkout (with real account)
curl -X POST https://yourdomain.com/api/payments/checkout \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "REAL_ORDER_ID",
    "amount": 10000,
    "description": "Test Order"
  }'

# Verify response
# Check database
# Check PayMongo dashboard
```

---

## 📊 Post-Deployment Verification

### Immediate Checks (First Hour)
- [ ] Server responding to requests
- [ ] Authentication working
- [ ] Test payment flow working
- [ ] Webhooks being received
- [ ] No errors in logs
- [ ] Database connections stable

### Day 1 Monitoring
- [ ] Payment success rate > 95%
- [ ] No critical errors
- [ ] Webhook delivery successful
- [ ] Response times < 2 seconds
- [ ] Database performance normal

### Week 1 Monitoring
- [ ] Review all failed payments
- [ ] Check refund processing
- [ ] Verify withdrawal requests
- [ ] Monitor webhook reliability
- [ ] Review error logs

---

## 🐛 Rollback Plan

If critical issues occur:

### Step 1: Immediate Actions
```bash
# 1. Stop accepting new payments (feature flag)
# 2. Switch to maintenance mode
# 3. Investigate issue
```

### Step 2: Rollback
```bash
# 1. Revert to previous version
git revert HEAD
git push origin main

# 2. Redeploy
npm ci --production
pm2 restart app

# 3. Verify old version working
```

### Step 3: Data Integrity
```bash
# 1. Check for incomplete payments
Payment.find({ 
  status: 'processing',
  createdAt: { $gte: DEPLOYMENT_TIME }
});

# 2. Manually reconcile with PayMongo
# 3. Update payment statuses
```

---

## 📈 Success Metrics

### Key Performance Indicators
- **Payment Success Rate:** > 95%
- **Average Response Time:** < 2 seconds
- **Webhook Delivery:** > 99%
- **Error Rate:** < 1%
- **Refund Processing Time:** < 5 minutes

### Monitoring Queries
```javascript
// Success rate today
const today = new Date().setHours(0,0,0,0);
const total = await Payment.countDocuments({ 
  createdAt: { $gte: today },
  type: 'checkout'
});
const succeeded = await Payment.countDocuments({ 
  createdAt: { $gte: today },
  type: 'checkout',
  status: 'succeeded'
});
const successRate = (succeeded / total) * 100;

// Failed payments
const failed = await Payment.find({ 
  status: 'failed',
  createdAt: { $gte: today }
}).select('userId amount failureReason');

// Pending withdrawals
const pendingWithdrawals = await Payment.find({ 
  type: 'withdraw',
  status: 'pending'
});
```

---

## 🔔 Alerting Rules

Set up alerts for:
1. **Payment Success Rate < 90%**
2. **Webhook Delivery Failure**
3. **Response Time > 5 seconds**
4. **Error Rate > 5%**
5. **Database Connection Lost**
6. **PayMongo API Down**

---

## 📞 Emergency Contacts

**Development Team:**
- Lead Developer: [Name/Contact]
- Backend Team: [Contact]
- DevOps: [Contact]

**External:**
- PayMongo Support: support@paymongo.com
- Database Admin: [Contact]
- Infrastructure: [Contact]

---

## 📝 Deployment Log Template

```
Deployment Date: _______________
Deployment Time: _______________
Version: _______________
Deployed By: _______________

Pre-Deployment Checks:
☐ Tests Passing
☐ Environment Variables Set
☐ Database Ready
☐ PayMongo Configured

Deployment Steps:
☐ Code Deployed
☐ Server Restarted
☐ Smoke Tests Passed
☐ Webhooks Configured

Post-Deployment:
☐ No Critical Errors
☐ Payment Flow Working
☐ Monitoring Active

Issues Encountered:
[List any issues and resolutions]

Sign-Off:
Developer: _______________
QA: _______________
DevOps: _______________
```

---

## ✅ Final Checklist

Before marking deployment as complete:

- [ ] All pre-deployment checks passed
- [ ] Code deployed successfully
- [ ] Tests passing in production
- [ ] Webhooks receiving events
- [ ] No critical errors in logs
- [ ] Monitoring dashboards set up
- [ ] Team notified of deployment
- [ ] Documentation updated
- [ ] Rollback plan ready
- [ ] On-call schedule set

---

**Prepared By:** Engineering Team  
**Last Updated:** January 1, 2026  
**Version:** 1.0.0  
**Status:** Ready for Deployment ✅
