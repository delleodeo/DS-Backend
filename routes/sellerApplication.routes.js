const express = require('express');
const router = express.Router();
const sellerApplicationController = require('../modules/users/sellerApplication.controller');
const { uploadDocuments } = require('../modules/upload/upload.service');
const { protect } = require('../auth/auth.controller');

// Middleware to handle file uploads for seller applications
const uploadSellerDocuments = uploadDocuments.fields([
  { name: 'governmentId', maxCount: 1 },
  { name: 'birTin', maxCount: 1 },
  { name: 'dtiOrSec', maxCount: 1 }
]);

// Error handler for multer errors
const handleUploadErrors = (err, req, res, next) => {
  if (err) {
    console.error('Upload error:', err);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB per file.'
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files uploaded.'
      });
    }

    if (err.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    return res.status(400).json({
      success: false,
      error: 'File upload failed',
      details: err.message
    });
  }
  next();
};

// Public routes (authenticated users only)

/**
 * @route   GET /api/seller/status
 * @desc    Get seller application status for current user
 * @access  Private
 */
router.get('/status', protect, sellerApplicationController.getApplicationStatus);

/**
 * @route   DELETE /api/seller/cancel
 * @desc    Cancel seller application and delete associated documents
 * @access  Private
 */
router.delete('/cancel', protect, sellerApplicationController.cancelApplication);

/**
 * @route   POST /api/seller/apply
 * @desc    Submit seller application with documents
 * @access  Private
 */
router.post(
  '/apply',
  protect,
  uploadSellerDocuments,
  handleUploadErrors,
  sellerApplicationController.submitApplication
);

/**
 * @route   DELETE /api/seller/cancel
 * @desc    Cancel seller application and cleanup documents
 * @access  Private
 */
router.delete('/cancel', protect, sellerApplicationController.cancelApplication);

/**
 * @route   GET /api/seller/document/:userId/:docType
 * @desc    Get a document URL for viewing (admin only)
 * @access  Private (Admin)
 */
router.get('/document/:userId/:docType', protect, sellerApplicationController.getDocumentUrl);

// Admin routes

/**
 * @route   GET /api/seller/admin/pending
 * @desc    Get all pending seller applications (admin only)
 * @access  Private (Admin)
 */
router.get('/admin/pending', protect, sellerApplicationController.getPendingApplications);

/**
 * @route   PUT /api/seller/admin/review/:userId
 * @desc    Review a seller application (approve/reject)
 * @access  Private (Admin)
 */
router.put('/admin/review/:userId', protect, sellerApplicationController.reviewApplication);

/**
 * @route   POST /api/seller/admin/create-missing-vendors
 * @desc    Create vendor profiles for existing approved sellers
 * @access  Private (Admin)
 */
router.post('/admin/create-missing-vendors', protect, sellerApplicationController.createMissingVendorProfiles);

module.exports = router;