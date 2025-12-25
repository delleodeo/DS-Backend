# Cart Service Module: Critical Fixes Implementation Prompt

**Use this prompt with your development team or AI coding assistant to address the identified issues**

---

## 🎯 PROMPT FOR IMMEDIATE CRITICAL FIXES

```
You are an expert Node.js backend developer tasked with fixing critical security 
vulnerabilities and reliability issues in a shopping cart service module.

CONTEXT:
The cart service module (cart.controller.js, cart.service.js, cart.routes.js, 
cart.model.js) has undergone code review and requires immediate fixes before 
production deployment.

CRITICAL ISSUES IDENTIFIED:
1. ❌ No authentication - All routes are unprotected
2. ❌ Race conditions in stock validation - Not atomic
3. ❌ NoSQL injection vulnerability - No input validation
4. ❌ Poor error handling - All errors return 500
5. ❌ Inefficient caching - Using blocking Redis operations
6. ❌ Console.log statements in production code

YOUR TASK:
Implement the following fixes in order of priority. For each fix, provide:
- Complete, production-ready code
- Inline comments explaining security/performance considerations
- Error handling for edge cases
- Unit tests for critical paths

---

## PHASE 1: SECURITY FIXES (BLOCKER - DO FIRST)

### FIX 1: Add Authentication to All Routes

REQUIREMENT:
Apply the existing `protect` middleware (already imported but unused) to all cart 
routes. Add additional security layers including:
- User ownership verification
- Rate limiting (100 requests per 15 minutes per user)
- Input sanitization

FILES TO MODIFY:
- cart.routes.js
- Create: middleware/verifyCartOwnership.js
- Create: middleware/rateLimiter.js

ACCEPTANCE CRITERIA:
✓ All routes require authentication
✓ Users can only access their own carts
✓ Rate limiting prevents abuse
✓ Unauthorized access returns 401 status
✓ Ownership violations return 403 status

IMPLEMENTATION:
```javascript
// cart.routes.js - Fix authentication
// TODO: Apply protect middleware to all routes
// TODO: Add rate limiting middleware
// TODO: Add ownership verification where needed

// middleware/verifyCartOwnership.js - Create new file
// TODO: Verify cart belongs to authenticated user
// TODO: Attach cart to req.cart for downstream use
// TODO: Handle non-existent carts gracefully

// middleware/rateLimiter.js - Create new file  
// TODO: Configure express-rate-limit
// TODO: Use user ID as rate limit key
// TODO: Return clear error messages when limit exceeded
```

---

### FIX 2: Implement Input Validation

REQUIREMENT:
Add comprehensive input validation using Joi schema validation. Validate:
- All ObjectIds are valid MongoDB ObjectIds
- Quantities are integers between 1-50
- Required fields are present
- No extra fields (stripUnknown: true)

FILES TO CREATE:
- validators/cart.validator.js

FILES TO MODIFY:
- cart.routes.js (apply validation middleware)

ACCEPTANCE CRITERIA:
✓ Invalid ObjectIds rejected with 400 error
✓ Negative/zero quantities rejected
✓ Quantities > 50 rejected
✓ Missing required fields rejected with clear error messages
✓ All errors return field name and validation message
✓ No NoSQL injection possible

VALIDATION SCHEMAS NEEDED:
```javascript
// validators/cart.validator.js - Create validation schemas for:
// 1. addToCartSchema - validate { item: { productId, optionId?, quantity } }
// 2. updateCartItemSchema - validate quantity can be negative for decrements
// 3. removeCartItemSchema - validate productId and optional optionId

// TODO: Create custom ObjectId validator
// TODO: Implement validation middleware factory
// TODO: Return structured error responses
// TODO: Strip unknown fields automatically
```

---

### FIX 3: Proper HTTP Status Codes & Error Handling

REQUIREMENT:
Replace generic 500 errors with appropriate HTTP status codes:
- 400: Bad Request (validation errors)
- 401: Unauthorized (missing/invalid auth)
- 403: Forbidden (ownership violation)
- 404: Not Found (resource doesn't exist)
- 409: Conflict (stock insufficient, business logic errors)
- 500: Internal Server Error (unexpected errors only)

Create custom error classes and global error handler.

FILES TO CREATE:
- utils/errorHandler.js

FILES TO MODIFY:
- cart.controller.js (use asyncHandler, throw proper errors)
- cart.service.js (throw typed errors)
- app.js (register global error handler)

ACCEPTANCE CRITERIA:
✓ Each error type has dedicated class
✓ Operational errors distinguished from programming errors
✓ Production mode hides stack traces
✓ Development mode shows full error details
✓ All async errors caught automatically
✓ Error logs include context (userId, productId, etc.)

ERROR CLASSES NEEDED:
```javascript
// utils/errorHandler.js - Create:
// 1. AppError (base class)
// 2. ValidationError (400)
// 3. UnauthorizedError (401)
// 4. ForbiddenError (403)
// 5. NotFoundError (404)
// 6. ConflictError (409)
// 7. errorHandler middleware (global handler)
// 8. asyncHandler wrapper (catch async errors)

// TODO: Sanitize error messages in production
// TODO: Log stack traces for 500 errors only
// TODO: Include timestamp in error responses
```

---

## PHASE 2: RACE CONDITION FIXES (BLOCKER - DO SECOND)

### FIX 4: Implement Distributed Locking

REQUIREMENT:
Prevent race conditions in stock validation using distributed locks with Redlock.
Lock scope: per user + product + option combination.

SCENARIO TO PREVENT:
```
Stock available: 5
User adds 4 items (Request 1)
User adds 4 items (Request 2) - concurrent
Result: 8 items added ❌ Should fail with stock error
```

FILES TO CREATE:
- utils/distributedLock.js

FILES TO MODIFY:
- cart.service.js (wrap critical sections with locks)
- config/redis.js (add Redlock initialization)

ACCEPTANCE CRITERIA:
✓ Concurrent requests for same product are serialized
✓ Locks automatically released after 5 seconds
✓ Lock failures don't crash the application
✓ Lock acquisition retries 3 times with backoff
✓ Different products can be added concurrently

IMPLEMENTATION PATTERN:
```javascript
// utils/distributedLock.js
// TODO: Initialize Redlock with Redis client
// TODO: Create acquireLock(resource, ttl) function
// TODO: Create withLock(resource, operation, ttl) helper
// TODO: Handle lock acquisition failures gracefully
// TODO: Always release locks in finally block

// cart.service.js - Apply locking to:
// 1. addToCartService - lock on `cart:${userId}:product:${productId}:${optionId}`
// 2. updateCartItemService - same lock pattern
// Lock scope: lock only what's being modified, allow concurrent different products
```

---

### FIX 5: Implement MongoDB Transactions

REQUIREMENT:
Wrap multi-step operations in MongoDB transactions to ensure atomicity.
If ANY step fails, entire operation rolls back.

OPERATIONS REQUIRING TRANSACTIONS:
1. Check stock → Update cart → Reserve stock (atomic)
2. Update cart → Update product reservations (atomic)

FILES TO CREATE:
- utils/transaction.js

FILES TO MODIFY:
- cart.service.js (use transactions for critical operations)
- config/database.js (enable replica set for transactions)

ACCEPTANCE CRITERIA:
✓ Stock check and cart update are atomic
✓ Failed operations roll back completely
✓ Transient errors retry automatically (3 attempts)
✓ Write conflicts handled gracefully
✓ Sessions properly closed even on errors

TRANSACTION PATTERN:
```javascript
// utils/transaction.js
// TODO: Create withTransaction(operations, options) helper
// TODO: Create withRetry(operation, maxRetries, delay) helper
// TODO: Handle TransientTransactionError
// TODO: Handle WriteConflict errors
// TODO: Implement exponential backoff for retries

// cart.service.js - Wrap these in transactions:
exports.addToCartService = async (userId, item) => {
  return await withLock(lockKey, async () => {
    return await withRetry(async () => {
      return await withTransaction(async (session) => {
        // 1. Check stock (with session)
        // 2. Update cart (with session)
        // 3. Reserve stock (with session)
        // All-or-nothing atomicity
      });
    });
  });
};
```

---

## PHASE 3: PERFORMANCE OPTIMIZATIONS (HIGH PRIORITY)

### FIX 6: Efficient Cache Management

REQUIREMENT:
Fix inefficient Redis operations that block the server:
- Replace keys() with scan() for pattern matching
- Add TTL to all cached data
- Implement proper error logging (no silent failures)
- Use pipelining for bulk operations

FILES TO MODIFY:
- config/redis.js (add safe wrapper functions)
- cart.service.js (use safe wrappers, add TTL)

CURRENT PROBLEMS:
```javascript
// ❌ BAD: Blocks Redis entirely
const keys = await redisClient.keys("cart:*");

// ❌ BAD: No expiration, stale data forever
await redisClient.set(key, value);

// ❌ BAD: Silent failures, hard to debug
await redisClient.set(key, value).catch(() => {});
```

REQUIREMENTS:
```javascript
// config/redis.js - Create safe wrappers:
// TODO: safeSet(key, value, options) - Always set TTL
// TODO: safeGet(key) - Log cache hits/misses
// TODO: safeDel(keys) - Handle arrays and single keys
// TODO: safeDelPattern(pattern) - Use SCAN not KEYS
// TODO: Log all Redis errors properly

// TTL Strategy:
const CACHE_TTL = {
  CART: 3600,      // 1 hour (frequently updated)
  PRODUCT: 7200,   // 2 hours (stable)
  STOCK: 300,      // 5 minutes (volatile)
};

// cart.service.js - Apply TTL:
// TODO: Set TTL when caching cart data
// TODO: Use SCAN for cache invalidation
// TODO: Log cache operations for monitoring
```

---

### FIX 7: Database Indexing

REQUIREMENT:
Add critical indexes to improve query performance.

FILES TO MODIFY:
- cart.model.js (add indexes to schema)

INDEXES NEEDED:
```javascript
// cart.model.js - Add these indexes:
// 1. userId: 1 (unique) - Primary query pattern
// 2. { 'items.productId': 1, updatedAt: -1 } - Admin queries
// 3. { updatedAt: 1 } with TTL - Auto-cleanup old carts
// 4. Consider compound index for frequent query patterns

// TODO: Add index definitions to schema
// TODO: Add pre-save validation to prevent duplicate items
// TODO: Consider TTL index for abandoned cart cleanup
```

---

### FIX 8: Remove Console.log Statements

REQUIREMENT:
Replace all console.log with proper structured logging using Winston.

FILES TO CREATE:
- config/logger.js

FILES TO MODIFY:
- cart.controller.js (remove console.log)
- cart.service.js (remove console.log)
- All files with console.log statements

LOGGING LEVELS:
- error: System errors, exceptions
- warn: Deprecated features, non-critical issues
- info: Significant events (cart operations)
- debug: Detailed diagnostic info (cache hits/misses)

IMPLEMENTATION:
```javascript
// config/logger.js - Create Winston logger with:
// TODO: Different log levels per environment
// TODO: Sanitize sensitive data (passwords, tokens)
// TODO: Structured JSON logging for production
// TODO: Console output for development
// TODO: File rotation for log files

// Replace all instances:
console.log(cart) → log.info('Cart retrieved', { userId, itemCount })
console.log('Removing item: START') → log.debug('Removing cart item', { productId, optionId })
console.error(err) → log.error('Cart operation failed', { error: err.message, stack: err.stack })
```

---

## PHASE 4: TESTING & MONITORING (MEDIUM PRIORITY)

### FIX 9: Unit & Integration Tests

REQUIREMENT:
Create comprehensive test coverage for all critical paths.

FILES TO CREATE:
- tests/unit/cart.service.test.js
- tests/integration/cart.api.test.js
- tests/helpers/testSetup.js

TEST COVERAGE REQUIRED:
```javascript
// Unit Tests (cart.service.test.js):
// TODO: addToCartService - creates new cart
// TODO: addToCartService - adds to existing cart
// TODO: addToCartService - increments existing item quantity
// TODO: addToCartService - throws error when stock insufficient
// TODO: addToCartService - handles race conditions
// TODO: removeCartItemService - removes correct item
// TODO: removeCartItemService - handles optionId correctly
// TODO: updateCartItemService - validates stock
// TODO: clearCartService - empties cart

// Integration Tests (cart.api.test.js):
// TODO: POST /cart/add - succeeds with valid auth and data
// TODO: POST /cart/add - fails without auth (401)
// TODO: POST /cart/add - fails with invalid data (400)
// TODO: POST /cart/add - fails when stock insufficient (409)
// TODO: GET /cart - returns user's cart only
// TODO: DELETE /cart/remove - removes item
// TODO: Test rate limiting
// TODO: Test concurrent requests (race conditions)

// Target Coverage: 80% lines, branches, functions
```

---

### FIX 10: Health Checks & Monitoring

REQUIREMENT:
Add health check endpoints and metrics collection.

FILES TO CREATE:
- routes/health.js
- utils/metrics.js

FILES TO MODIFY:
- app.js (register health and metrics routes)

ENDPOINTS NEEDED:
```javascript
// routes/health.js - Create endpoints:
// 1. GET /health - Overall health status
// 2. GET /health/live - Liveness probe (is process running?)
// 3. GET /health/ready - Readiness probe (can handle requests?)

// Health checks should verify:
// TODO: MongoDB connection status
// TODO: Redis connection status (optional, degraded if down)
// TODO: Response time thresholds

// utils/metrics.js - Collect metrics:
// 1. cart_operation_duration_seconds (histogram)
// 2. cart_items_total (gauge)
// 3. stock_validation_total (counter - success/failure)
// 4. cache_hits_total (counter - hit/miss)

// TODO: Export metrics on /metrics endpoint
// TODO: Use Prometheus format
// TODO: Add metrics middleware to routes
```

---

## IMPLEMENTATION ORDER & TIMELINE

### Week 1 - Critical Security Fixes (BLOCKERS)
**Day 1-2:**
- [ ] FIX 1: Authentication (4 hours)
- [ ] FIX 2: Input Validation (8 hours)
- [ ] Testing & Security Review (4 hours)

**Day 3-4:**
- [ ] FIX 3: Error Handling (6 hours)
- [ ] FIX 4: Distributed Locking (16 hours)

**Day 5:**
- [ ] FIX 5: MongoDB Transactions (8 hours)
- [ ] Integration Testing (4 hours)

### Week 2 - Performance & Quality
**Day 1-2:**
- [ ] FIX 6: Cache Management (10 hours)
- [ ] FIX 7: Database Indexing (6 hours)

**Day 3:**
- [ ] FIX 8: Logging System (8 hours)

**Day 4-5:**
- [ ] FIX 9: Unit & Integration Tests (24 hours)
- [ ] FIX 10: Health Checks & Monitoring (10 hours)

---

## VALIDATION CHECKLIST

Before marking as complete, verify:

### Security ✓
- [ ] All routes require authentication
- [ ] Input validation prevents NoSQL injection
- [ ] Error messages don't leak sensitive info
- [ ] Rate limiting prevents abuse
- [ ] Users can only access their own data

### Race Conditions ✓
- [ ] Concurrent adds to same product don't exceed stock
- [ ] Locks automatically released
- [ ] Failed locks don't crash application
- [ ] Transactions roll back on error

### Performance ✓
- [ ] No blocking Redis commands (keys)
- [ ] All cached data has TTL
- [ ] Database queries use indexes
- [ ] Response times < 200ms (p95)

### Code Quality ✓
- [ ] No console.log statements
- [ ] All errors logged with context
- [ ] Test coverage > 80%
- [ ] All async errors caught
- [ ] Code follows style guide

### Reliability ✓
- [ ] Health check endpoints working
- [ ] Metrics being collected
- [ ] Monitoring alerts configured
- [ ] Error rates < 0.1%

---

## TESTING SCENARIOS

### Test Race Conditions:
```bash
# Simulate concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/cart/add \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"item":{"productId":"...","quantity":5}}' &
done
wait

# Verify: Only stock-limited quantity added, not 10x5=50 items
```

### Test Authentication:
```bash
# Should fail with 401
curl http://localhost:3000/api/cart

# Should succeed with 200
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/cart
```

### Test Input Validation:
```bash
# Should fail with 400 - invalid ObjectId
curl -X POST http://localhost:3000/api/cart/add \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"item":{"productId":"invalid","quantity":1}}'

# Should fail with 400 - quantity > 50
curl -X POST http://localhost:3000/api/cart/add \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"item":{"productId":"valid-id","quantity":100}}'
```

### Load Testing:
```bash
# Test with Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/cart

# Verify: p95 latency < 200ms, error rate < 0.1%
```

---

## DEPENDENCIES TO INSTALL

```bash
npm install joi                    # Input validation
npm install redlock                # Distributed locking
npm install winston                # Logging
npm install express-rate-limit     # Rate limiting
npm install prom-client            # Metrics
npm install jest supertest         # Testing
npm install mongodb-memory-server  # Test database
```

---

## COMPLETION CRITERIA

This task is complete when:

1. ✅ All routes require authentication
2. ✅ All inputs validated and sanitized
3. ✅ Proper HTTP status codes used
4. ✅ Race conditions eliminated
5. ✅ MongoDB transactions implemented
6. ✅ Efficient caching with TTL
7. ✅ Database indexes added
8. ✅ Structured logging implemented
9. ✅ Test coverage > 80%
10. ✅ Health checks and metrics working
11. ✅ Load tests passing
12. ✅ Security audit passed
13. ✅ Code review approved
14. ✅ Documentation updated

---

## RESOURCES & REFERENCES

- [Joi Validation](https://joi.dev/api/)
- [Redlock Algorithm](https://redis.io/docs/manual/patterns/distributed-locks/)
- [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Winston Logger](https://github.com/winstonjs/winston)
- [Express Rate Limit](https://github.com/nfriedly/express-rate-limit)
- [Jest Testing](https://jestjs.io/docs/getting-started)

---

## QUESTIONS FOR DEVELOPER

Before starting implementation, clarify:

1. Is MongoDB running as a replica set? (Required for transactions)
2. Is Redis available? (If not, use optimistic locking fallback)
3. What's the target response time SLA?
4. Are there existing authentication/authorization patterns to follow?
5. What monitoring tools are in place? (Prometheus, Grafana, etc.)
6. What's the deployment strategy? (Gradual rollout or big bang?)

---

**Good luck! These fixes will transform the cart service from vulnerable to production-ready.**
```

---

## 💡 HOW TO USE THIS PROMPT

### For AI Coding Assistants (GitHub Copilot, ChatGPT, Claude):
```
1. Copy the entire prompt above
2. Paste into your AI assistant
3. Add: "Please implement FIX 1 first, showing complete code"
4. Review generated code
5. Test thoroughly
6. Move to next fix
```

### For Development Team:
```
1. Create JIRA tickets from each FIX section
2. Assign priority labels (P0, P1, P2)
3. Include acceptance criteria in ticket
4. Reference this document for implementation details
5. Use validation checklist for PR reviews
```

### For Code Review:
```
Use this prompt as a checklist:
- Does the PR address the specific FIX requirements?
- Are all acceptance criteria met?
- Are tests included and passing?
- Is the implementation secure and performant?
```

---

## 📋 QUICK REFERENCE CARD

**PRIORITY ORDER:**
1. 🔴 P0: Authentication (2-4h)
2. 🔴 P0: Input Validation (6-8h)
3. 🔴 P0: Error Handling (4-6h)
4. 🔴 P0: Race Conditions (16-20h)
5. 🔴 P0: Transactions (12-16h)
6. 🟡 P1: Cache Management (8-10h)
7. 🟡 P1: Database Indexes (4-6h)
8. 🟡 P1: Logging (6-8h)
9. 🟢 P2: Testing (20-24h)
10. 🟢 P2: Monitoring (8-10h)

**TOTAL EFFORT:** ~160-180 hours

**TEAM SIZE:** 2-3 developers, 1 QA, 1 DevOps (part-time)

**TIMELINE:** 4-5 weeks