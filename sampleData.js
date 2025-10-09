// // user register : http://localhost:3000/v1/user/register

const user = {
  "name": "Dora Vendor",
  "email": "vendor@example.com",
  "password": "mypassword",
  "role": "vendor",
  "phone": "09171234567",
  "address": {
    "street": "789 Vendor St",
    "barangay": "Trece",
    "city": "Cavite City",
    "province": "Cavite",
    "zipCode": "4100"
  }
  }

// add and update cart : http://localhost:3000/v1/cart/add // http://localhost:3000/v1/cart/update
const cart = {
   "item" :{ 
    "productId": "686584e7716be71b4273bdff",
    "optionId": "686584e7716be71b4273be00",
    "shippingFee" : 90,
    "quantity": 1
  }
}

const createVendor = {
  "storeName": "DoroShop Electronics",
  "description": "We specialize in affordable and quality gadgets, phones, and accessories.",
  "address": {
    "street": "123 Mabini St",
    "barangay": "Barangay Central",
    "city": "Quezon City",
    "province": "Metro Manila",
    "zipCode": "1101"
  },
  "imageUrl": "https://example.com/images/vendors/doroshop-logo.png",
  "bannerUrl": "https://example.com/images/vendors/doroshop-banner.jpg",
  "isApproved": true,
  "documentsSubmitted": true,
  "documents": [
    "https://example.com/docs/business-permit.pdf",
    "https://example.com/docs/dti-registration.pdf"
  ],
  "followers": [
    "64e3a9a1d930a9b77c8f19e2",
    "64e3a9a1d930a9b77c8f19e3"
  ],
  "rating": 4.9,
  "numRatings": 83,
  "accountBalance": {
    "cash": 10890.50,
    "usdt": 120.75
  },
  "totalProducts": 153,
  "totalOrders": 478,
  "totalRevenue": 352740.85,
  "topBuyer": ["John Doe", "Jane Dela Cruz", "Carlos Tan"],
  "profileViews": 1290,
  "productClicks": 5340,
  "currentMonthlyRevenue": 48560.30,
  "monthlyRevenueComparison": [
    {
      "month": "January",
      "currentValue": 12450,
      "previousValue": 10900
    },
    {
      "month": "February",
      "currentValue": 14200,
      "previousValue": 12000
    },
    {
      "month": "March",
      "currentValue": 16890,
      "previousValue": 15000
    },
    {
      "month": "April",
      "currentValue": 12300,
      "previousValue": 9800
    },
    {
      "month": "May",
      "currentValue": 15520,
      "previousValue": 13200
    },
    {
      "month": "June",
      "currentValue": 19400,
      "previousValue": 18200
    },
    {
      "month": "July",
      "currentValue": 21600,
      "previousValue": 20500
    }
  ],
  "createdAt": "2024-03-15T09:30:00.000Z",
  "updatedAt": "2025-07-15T12:00:00.000Z"
}
