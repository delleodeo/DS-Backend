# Monthly Revenue Tracking API Documentation

## Base URL
```
http://localhost:3002/api/vendors
```

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Data Models](#data-models)
5. [Response Codes](#response-codes)
6. [Usage Examples](#usage-examples)

---

## 📊 Overview

**Real-Time Revenue Tracking:**
- ✅ Revenue is **automatically pushed** to `monthlyRevenueComparison` on **every sale**
- ✅ Each order completion immediately updates the current month and year
- ✅ No waiting for month-end - revenue tracking is instant
- ✅ `currentMonthlyRevenue` tracks running total (optional reset at month start)

**Flow:**
```
Order Completed → Revenue Added to monthlyRevenueComparison[CurrentMonth][CurrentYear]
```

---

## 🔐 Authentication

All endpoints require authentication via Bearer token in the Authorization header.

```
Authorization: Bearer <your_token_here>
```

**Roles:**
- `vendor` - Can access their own revenue data
- `admin` - Can access all vendor data and batch operations

---

## 📡 Endpoints

### 1. Reset Monthly Revenue (Individual Vendor) - Optional

Resets the `currentMonthlyRevenue` counter to 0. Use this at the start of a new month if needed.

**Endpoint:** `POST /api/vendors/reset-monthly-revenue`

**Authentication:** Required (Vendor or Admin)

**Request Headers:**
```json
{
  "Authorization": "Bearer <vendor_token>",
  "Content-Type": "application/json"
}
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Current monthly revenue reset for December 2025",
  "data": [
    {
      "year": 2025,
      "revenues": {
        "January": 50000,
        "February": 60000,
        "March": 55000,
        "April": 58000,
        "May": 62000,
        "June": 65000,
        "July": 68000,
        "August": 70000,
        "September": 72000,
        "October": 75000,
        "November": 80000,
        "December": 0
      }
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Vendor not found"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3002/api/vendors/reset-monthly-revenue \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

---

### 2. Batch Reset Monthly Revenue (All Vendors) - Optional

Resets `currentMonthlyRevenue` for all vendors in the system. **Admin only.**

**Endpoint:** `POST /api/vendors/batch-reset-monthly-revenue`

**Authentication:** Required (Admin only)

**Request Headers:**
```json
{
  "Authorization": "Bearer <admin_token>",
  "Content-Type": "application/json"
}
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Batch monthly revenue reset completed",
  "totalVendors": 50,
  "successCount": 50,
  "failedCount": 0,
  "details": {
    "success": [
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012",
      "507f1f77bcf86cd799439013"
    ],
    "failed": []
  }
}
```

**Error Response (403 Forbidden):**
```json
{
  "error": "Access denied. Admin role required."
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3002/api/vendors/batch-reset-monthly-revenue \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

---

## 📊 Data Models

### Vendor Schema (Relevant Fields)

```javascript
{
  "userId": "ObjectId",              // Reference to User
  "storeName": "String",             // Vendor store name
  "currentMonthlyRevenue": "Number", // Current month running total (reference only)
  "totalRevenue": "Number",          // All-time total revenue
  "totalOrders": "Number",           // Total completed orders
  "monthlyRevenueComparison": [      // Historical monthly data (UPDATED IN REAL-TIME)
    {
      "year": "Number",              // e.g., 2025
      "revenues": {
        "January": "Number",         // Revenue for January
        "February": "Number",        // Revenue for February
        "March": "Number",           // Revenue for March
        "April": "Number",           // Revenue for April
        "May": "Number",             // Revenue for May
        "June": "Number",            // Revenue for June
        "July": "Number",            // Revenue for July
        "August": "Number",          // Revenue for August
        "September": "Number",       // Revenue for September
        "October": "Number",         // Revenue for October
        "November": "Number",        // Revenue for November
        "December": "Number"         // Revenue for December
      }
    }
  ]
}
```

### Monthly Revenue Data Structure

```json
{
  "year": 2025,
  "revenues": {
    "January": 50000,
    "February": 60000,
    "March": 55000,
    "April": 58000,
    "May": 62000,
    "June": 65000,
    "July": 68000,
    "August": 70000,
    "September": 72000,
    "October": 75000,
    "November": 80000,
    "December": 0
  }
}
```

---

## 🔄 Response Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request or vendor not found |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions (admin required) |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error occurred |

---

## 💡 Usage Examples

### Example 1: Automatic Revenue Tracking (On Each Sale)

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
        "November": 80000  // ← Was 75000, now 80000
      }
    }
  ],
  "currentMonthlyRevenue": 80000,
  "totalRevenue": 485000
}
```

---

### Example 2: Reset Monthly Revenue Counter (Optional)

**Scenario:** It's December 1st, and you want to reset the `currentMonthlyRevenue` counter

```javascript
// JavaScript/Node.js
const axios = require('axios');

const resetRevenue = async () => {
  try {
    const response = await axios.post(
      'http://localhost:3002/api/vendors/reset-monthly-revenue',
      {},
      {
        headers: {
          'Authorization': 'Bearer YOUR_VENDOR_TOKEN',
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Revenue counter reset:', response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
};

resetRevenue();
```

**Expected Result:**
- `currentMonthlyRevenue` reset to 0
- `monthlyRevenueComparison` remains unchanged (already has all data)

---

### Example 3: Frontend Integration (React)

```javascript
import axios from 'axios';
import { useEffect, useState } from 'react';

const VendorRevenueDashboard = () => {
  const [revenueData, setRevenueData] = useState(null);

  useEffect(() => {
    const fetchVendorData = async () => {
      const token = localStorage.getItem('vendorToken');
      const response = await axios.get(
        'http://localhost:3002/api/vendors',
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setRevenueData(response.data.monthlyRevenueComparison);
    };

    fetchVendorData();
  }, []);

  return (
    <div>
      <h2>Monthly Revenue</h2>
      {revenueData?.map(yearData => (
        <div key={yearData.year}>
          <h3>Year: {yearData.year}</h3>
          {Object.entries(yearData.revenues).map(([month, amount]) => (
            <div key={month}>
              {month}: ${amount.toLocaleString()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default VendorRevenueDashboard;
```

---

## 🔄 Automatic Processing

### Real-Time Revenue Tracking

**On Every Order Completion:**
```
Order marked as "delivered"
    ↓
System automatically:
1. Gets current date (month & year)
2. Finds or creates year entry in monthlyRevenueComparison
3. Adds order amount to current month's revenue
4. Updates currentMonthlyRevenue
5. Updates totalRevenue and totalOrders
6. Saves to MongoDB
7. Clears cache
```

**Console Output:**
```
✅ Revenue updated for vendor 507f1f77bcf86cd799439011: +5000 (November 2025)
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

## 🧪 Testing

### Test Real-Time Revenue Tracking

1. **Create a test order**
2. **Mark order as "delivered"**
3. **Check console logs:**
   ```
   ✅ Revenue updated for vendor {id}: +{amount} ({month} {year})
   ```
4. **Query vendor document** - verify `monthlyRevenueComparison` updated immediately

---

## 🐛 Error Handling

### Common Errors

#### 1. Vendor Not Found
```json
{
  "success": false,
  "error": "Vendor not found"
}
```
**Solution:** Verify the vendor exists and userId is correct

#### 2. Unauthorized Access
```json
{
  "error": "Authentication required"
}
```
**Solution:** Include valid Bearer token in Authorization header

#### 3. Insufficient Permissions
```json
{
  "error": "Access denied. Admin role required."
}
```
**Solution:** Use admin token for batch operations

---

## 📝 Key Differences from Traditional Month-End Processing

| Feature | Traditional (Month-End) | New (Real-Time) |
|---------|------------------------|-----------------|
| **Revenue Recording** | End of month | Every sale |
| **Data Availability** | Wait 30 days | Immediate |
| **Manual Intervention** | Required | Not needed |
| **Accuracy** | Month-end snapshot | Real-time accumulation |
| **Current Month Data** | Not available | Always current |

---

## 🔗 Related Documentation

- [Quick Start Guide](./QUICK_START.md)
- [Visual Flow Diagram](./VISUAL_FLOW_DIAGRAM.md)
- [Order Integration](./ORDER_INTEGRATION_GUIDE.js)
- [Server Setup](./SERVER_SETUP_GUIDE.js)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

---

## 📞 Support

For issues or questions:
1. Check logs for error messages
2. Verify MongoDB and Redis connections
3. Ensure proper authentication
4. Review order completion flow
5. Check that revenue updates on "delivered" status
