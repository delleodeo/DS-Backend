const sellerApplicationService = require('./sellerApplication.service');
const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const { ValidationError, AuthorizationError, formatErrorResponse } = require('../../utils/errorHandler');

class SellerApplicationController {
  /**
   * Submit seller application
   * POST /api/seller/apply
   */
  async submitApplication(req, res) {
    try {
      const userId = req.user.id || req.user._id;
      const applicationData = sanitizeMongoInput(req.body);

      // Validate application data
      const dataErrors = sellerApplicationService.validateApplicationData(applicationData);
      if (dataErrors.length > 0) {
        const error = new ValidationError('Validation failed', dataErrors);
        return res.status(error.status).json(formatErrorResponse(error));
      }

      // Validate uploaded files
      const fileErrors = sellerApplicationService.validateFiles(req.files);
      if (fileErrors.length > 0) {
        const error = new ValidationError('File validation failed', fileErrors);
        return res.status(error.status).json(formatErrorResponse(error));
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
        const conflictError = new ValidationError(error.message);
        conflictError.status = 409;
        return res.status(conflictError.status).json(formatErrorResponse(conflictError));
      }

      const unexpected = new ValidationError('Failed to submit seller application');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
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
      if (req.user.role !== 'admin') {
        const error = new AuthorizationError('Access denied. Admin role required.');
        return res.status(error.status).json(formatErrorResponse(error));
      }

      const applications = await sellerApplicationService.getPendingApplications();

      res.json({
        success: true,
        applications,
        count: applications.length
      });

    } catch (error) {
      console.error('Get pending applications error:', error);
      const unexpected = new ValidationError('Failed to get pending applications');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
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
        const notFound = new ValidationError(error.message);
        notFound.status = 404;
        return res.status(notFound.status).json(formatErrorResponse(notFound));
      }

      if (error.message.includes('Only pending applications')) {
        const invalid = new ValidationError(error.message);
        invalid.status = 400;
        return res.status(invalid.status).json(formatErrorResponse(invalid));
      }

      const unexpected = new ValidationError('Failed to cancel application');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
    }
  }

  /**
   * Admin: Review seller application
   * PUT /api/seller/admin/review/:userId
   */
  async reviewApplication(req, res) {
    try {
      if (req.user.role !== 'admin') {
        const error = new AuthorizationError('Access denied. Admin role required.');
        return res.status(error.status).json(formatErrorResponse(error));
      }

      const { userId } = req.params;
      const decision = (req.body.decision || '').trim().toLowerCase();
      const rejectionReason = sanitizeMongoInput(req.body.rejectionReason);
      const reviewerId = req.user.id || req.user._id;

      // Validate decision
      if (!['approved', 'rejected'].includes(decision)) {
        const error = new ValidationError('Invalid decision. Must be "approved" or "rejected"');
        return res.status(error.status).json(formatErrorResponse(error));
      }

      // If rejecting, reason is required
      if (
        decision === 'rejected' &&
        (!rejectionReason || !rejectionReason.trim())
      ) {
        const error = new ValidationError('Rejection reason is required when rejecting an application');
        return res.status(error.status).json(formatErrorResponse(error));
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
        const notFound = new ValidationError(error.message);
        notFound.status = 404;
        return res.status(notFound.status).json(formatErrorResponse(notFound));
      }

      const unexpected = new ValidationError('Failed to review application');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
    }
  }

  /**
   * Get document URL for a user's seller application
   * GET /api/seller/document/:userId/:docType
   */
  async getDocumentUrl(req, res) {
    try {
      if (req.user.role !== 'admin') {
        const error = new AuthorizationError('Access denied. Admin role required.');
        return res.status(error.status).json(formatErrorResponse(error));
      }

      const { userId, docType } = req.params;
      const result = await sellerApplicationService.getDocumentUrl(userId, docType);
      res.json(result);
    } catch (error) {
      console.error('Get document URL error:', error);
      
      if (error.message.includes('not found')) {
        const notFound = new ValidationError(error.message);
        notFound.status = 404;
        return res.status(notFound.status).json(formatErrorResponse(notFound));
      }

      const unexpected = new ValidationError('Failed to get document URL');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
    }
  }

  /**
   * Admin: Create vendor profiles for existing approved sellers
   * POST /api/seller/admin/create-missing-vendors
   */
  async createMissingVendorProfiles(req, res) {
    try {
      if (req.user.role !== 'admin') {
        const error = new AuthorizationError('Access denied. Admin role required.');
        return res.status(error.status).json(formatErrorResponse(error));
      }

      const result = await sellerApplicationService.createMissingVendorProfiles();
      res.json(result);

    } catch (error) {
      console.error('Create missing vendor profiles error:', error);
      const unexpected = new ValidationError('Failed to create missing vendor profiles');
      unexpected.status = 500;
      res.status(unexpected.status).json(formatErrorResponse(unexpected));
    }
  }
}

module.exports = new SellerApplicationController();