// Admin Dashboard Routes - Comprehensive Admin API
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminDashboard.controller');
const { protect, restrictTo } = require('../../../auth/auth.controller');

// All routes require admin authentication
router.use(protect);
router.use(restrictTo('admin'));

// ============================================
// DASHBOARD & ANALYTICS
// ============================================
router.get('/stats', adminController.getDashboardStats);
router.get('/top-products', adminController.getTopSellingProducts);
router.get('/top-sellers', adminController.getTopSellers);
router.get('/sales-chart', adminController.getSalesChart);
router.get('/export/:type', adminController.exportData);

// ============================================
// USER MANAGEMENT
// ============================================
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.post('/users/:userId/restrict', adminController.restrictUser);
router.post('/users/:userId/unrestrict', adminController.unrestrictUser);
router.put('/users/:userId/role', adminController.changeUserRole);
router.post('/users/:userId/flag', adminController.flagUser);
router.post('/users/:userId/unflag', adminController.unflagUser);
router.get('/users/:userId/activity', adminController.getUserActivityLogs);

// ============================================
// SELLER MANAGEMENT
// ============================================
router.get('/sellers', adminController.getAllSellers);
router.get('/sellers/:sellerId/performance', adminController.getSellerPerformance);

// ============================================
// SELLER APPLICATION MANAGEMENT
// ============================================
router.get('/applications/pending', adminController.getPendingApplications);
router.put('/applications/:userId/review', adminController.reviewSellerApplication);

// ============================================
// PRODUCT MANAGEMENT
// ============================================
router.get('/products', adminController.getAllProducts);
router.get('/products/pending', adminController.getPendingProducts);
router.post('/products/:productId/approve', adminController.approveProduct);
router.post('/products/:productId/reject', adminController.rejectProduct);
router.post('/products/:productId/disable', adminController.disableProduct);
router.post('/products/:productId/enable', adminController.enableProduct);
router.post('/products/:productId/reset', adminController.resetProductToPending);
router.delete('/products/:productId', adminController.deleteProduct);
router.put('/products/:productId', adminController.updateProduct);

// ============================================
// ORDERS & COMMISSION
// ============================================
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:orderId', adminController.getOrderDetails);
router.put('/orders/:orderId/status', adminController.updateOrderStatus);
router.get('/commission/report', adminController.getCommissionReport);
router.get('/commission/summary', adminController.getCommissionSummary);
router.get('/commission/pending-cod', adminController.getPendingCODCommissions);
router.post('/commission/:orderId/collect', adminController.collectCODCommission);
router.post('/commission/:orderId/waive', adminController.waiveCommission);

// ============================================
// CATEGORIES
// ============================================
router.get('/categories', adminController.getAllCategories);
router.post('/categories', adminController.createCategory);
router.put('/categories/:categoryId', adminController.updateCategory);
router.delete('/categories/:categoryId', adminController.deleteCategory);
router.post('/categories/:categoryId/toggle', adminController.toggleCategoryStatus);

// ============================================
// BANNERS
// ============================================
router.get('/banners', adminController.getAllBanners);
router.get('/banners/active', adminController.getActiveBanners);
router.post('/banners', adminController.createBanner);
router.put('/banners/:bannerId', adminController.updateBanner);
router.delete('/banners/:bannerId', adminController.deleteBanner);
router.post('/banners/:bannerId/toggle', adminController.toggleBannerStatus);
router.post('/banners/:bannerId/interaction', adminController.recordBannerInteraction);

// ============================================
// ANNOUNCEMENTS
// ============================================
router.get('/announcements', adminController.getAllAnnouncements);
router.post('/announcements', adminController.createAnnouncement);
router.put('/announcements/:announcementId', adminController.updateAnnouncement);
router.delete('/announcements/:announcementId', adminController.deleteAnnouncement);

// ============================================
// REFUNDS
// ============================================
router.get('/refunds', adminController.getAllRefunds);
router.get('/refunds/:refundId', adminController.getRefundDetails);
router.post('/refunds/:refundId/approve', adminController.approveRefund);
router.post('/refunds/:refundId/reject', adminController.rejectRefund);
router.post('/refunds/:refundId/process', adminController.processRefund);

// ============================================
// SYSTEM SETTINGS
// ============================================
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.post('/settings/maintenance', adminController.toggleMaintenanceMode);
router.put('/settings/commission', adminController.updateCommissionRate);

// ============================================
// AUDIT LOGS
// ============================================
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
