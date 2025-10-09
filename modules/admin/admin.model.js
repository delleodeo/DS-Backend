const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema(
  {
    // Core platform metrics
    totalProducts: { type: Number, default: 0 },
    totalShops: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    platformRevenue: { type: Number, default: 0 },

    // Metrics for new activity (weekly/daily stats)
    newProductsCount: { type: Number, default: 0 },
    newShopsCount: { type: Number, default: 0 },
    newUsersCount: { type: Number, default: 0 },
    newOrdersCount: { type: Number, default: 0 },

    // Order stats breakdown
    pendingOrdersCount: { type: Number, default: 0 },
    completedOrdersCount: { type: Number, default: 0 },
    canceledOrdersCount: { type: Number, default: 0 },
    refundedOrdersCount: { type: Number, default: 0 },

    // Revenue breakdown
    todayRevenue: { type: Number, default: 0 },
    weekRevenue: { type: Number, default: 0 },
    monthRevenue: { type: Number, default: 0 },

    // Traffic/engagement metrics
    totalVisits: { type: Number, default: 0 },
    activeUsersToday: { type: Number, default: 0 },

    // Platform settings / admin info
    platformName: { type: String, default: 'DoroShop' },
    contactEmail: { type: String, default: '' },
    maintenanceMode: { type: Boolean, default: false },

    // Optional: logs or notes for admin actions
    lastMaintenance: { type: Date },
    notes: [{ message: String, createdAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', AdminSchema);
