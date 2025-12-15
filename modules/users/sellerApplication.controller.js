const sellerApplicationService = require('./sellerApplication.service');

class SellerApplicationController {
  /**
   * Submit seller application
   * POST /api/seller/apply
   */
  async submitApplication(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const applicationData = req.body;

      // Validate application data
      const dataErrors = sellerApplicationService.validateApplicationData(applicationData);
      if (dataErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: dataErrors
        });
      }

      // Validate uploaded files
      const fileErrors = sellerApplicationService.validateFiles(req.files);
      if (fileErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'File validation failed',
          details: fileErrors
        });
      }

      // Submit application
      const result = await sellerApplicationService.submitApplication(
        userId,
        applicationData,
        req.files
      );

      res.status(201).json(result);

    } catch (error) {
      console.error('Submit application error:', error);
      
      if (error.message.includes('already have a pending') || 
          error.message.includes('already a seller')) {
        return res.status(409).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to submit seller application',
        details: error.message
      });
    }
  }

  /**
   * Get seller application status
   * GET /api/seller/status
   */
  async getApplicationStatus(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const result = await sellerApplicationService.getApplicationStatus(userId);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('Get application status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get application status',
        details: error.message
      });
    }
  }

  /**
   * Admin: Get all pending applications
   * GET /api/seller/admin/pending
   */
  async getPendingApplications(req, res) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin role required.'
        });
      }

      const applications = await sellerApplicationService.getPendingApplications();

      res.json({
        success: true,
        applications,
        count: applications.length
      });

    } catch (error) {
      console.error('Get pending applications error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get pending applications',
        details: error.message
      });
    }
  }

  /**
   * Cancel seller application
   * DELETE /api/seller/cancel
   */
  async cancelApplication(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const result = await sellerApplicationService.cancelApplication(userId);

      res.json(result);

    } catch (error) {
      console.error('Cancel application error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Only pending applications')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to cancel application',
        details: error.message
      });
    }
  }

  /**
   * Admin: Review seller application
   * PUT /api/seller/admin/review/:userId
   */
  async reviewApplication(req, res) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin role required.'
        });
      }

      const { userId } = req.params;
      const { decision, rejectionReason } = req.body;
      const reviewerId = req.user.id || req.user._id;

      // Validate decision
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid decision. Must be "approved" or "rejected"'
        });
      }

      // If rejecting, reason is required
      if (
        decision === 'rejected' &&
        (!rejectionReason || !rejectionReason.trim())
      ) {
        return res.status(400).json({
          success: false,
          error: 'Rejection reason is required when rejecting an application'
        });
      }

      const result = await sellerApplicationService.reviewApplication(
        userId,
        reviewerId,
        decision,
        rejectionReason
      );

      res.json(result);

    } catch (error) {
      console.error('Review application error:', error);
      
      if (error.message.includes('not found') || error.message.includes('not pending')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to review application',
        details: error.message
      });
    }
  }

  /**
   * Get document URL for a user's seller application
   * GET /api/seller/document/:userId/:docType
   */
  async getDocumentUrl(req, res) {
    try {
      const { userId, docType } = req.params;
      const result = await sellerApplicationService.getDocumentUrl(userId, docType);
      res.json(result);
    } catch (error) {
      console.error('Get document URL error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get document URL',
        details: error.message
      });
    }
  }

  /**
   * Admin: Create vendor profiles for existing approved sellers
   * POST /api/seller/admin/create-missing-vendors
   */
  async createMissingVendorProfiles(req, res) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin role required.'
        });
      }

      const result = await sellerApplicationService.createMissingVendorProfiles();
      res.json(result);

    } catch (error) {
      console.error('Create missing vendor profiles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create missing vendor profiles',
        details: error.message
      });
    }
  }
}

module.exports = new SellerApplicationController();