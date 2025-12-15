const User = require('./users.model');
const { deleteFromCloudinary } = require('../upload/upload.service');

class SellerApplicationService {
  /**
   * Submit a seller application
   */
  async submitApplication(userId, applicationData, files) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has a pending or approved application
      if (user.sellerApplication.status === 'pending') {
        throw new Error('You already have a pending seller application');
      }

      if (user.sellerApplication.status === 'approved' || user.role === 'vendor') {
        throw new Error('You are already a seller');
      }

      // Prepare application data
      const sellerApplication = {
        shopName: applicationData.shopName,
        shopAddress: applicationData.shopAddress,
        status: 'pending',
        submittedAt: new Date()
      };

      // Add file URLs and public IDs if files were uploaded
      if (files.governmentId && files.governmentId[0]) {
        sellerApplication.governmentIdUrl = files.governmentId[0].path;
        sellerApplication.governmentIdPublicId = files.governmentId[0].filename;
      }

      if (files.birTin && files.birTin[0]) {
        sellerApplication.birTinUrl = files.birTin[0].path;
        sellerApplication.birTinPublicId = files.birTin[0].filename;
      }

      if (files.dtiOrSec && files.dtiOrSec[0]) {
        sellerApplication.dtiOrSecUrl = files.dtiOrSec[0].path;
        sellerApplication.dtiOrSecPublicId = files.dtiOrSec[0].filename;
      }

      // Clean up old application files if resubmitting
      if (user.sellerApplication.status === 'rejected') {
        await this.cleanupOldApplicationFiles(user.sellerApplication);
      }

      // Update user with new application
      user.sellerApplication = sellerApplication;
      await user.save();

      return {
        success: true,
        message: 'Seller application submitted successfully',
        application: user.sellerApplication
      };

    } catch (error) {
      console.error('Error submitting seller application:', error);
      throw error;
    }
  }

  /**
   * Get seller application status
   */
  async getApplicationStatus(userId) {
    try {
      const user = await User.findById(userId).select('sellerApplication role');
      if (!user) {
        throw new Error('User not found');
      }

      // Initialize seller application if it doesn't exist
      if (!user.sellerApplication || typeof user.sellerApplication !== 'object') {
        user.sellerApplication = {
          status: 'not_applied'
        };
        await user.save();
      }

      // Create a copy of the application with fixed URLs
      const applicationCopy = user.sellerApplication.toObject ? 
        user.sellerApplication.toObject() : 
        { ...user.sellerApplication };
      
      // Fix document URLs for proper access
      if (applicationCopy.governmentIdUrl) {
        applicationCopy.governmentIdUrl = this.fixDocumentUrl(applicationCopy.governmentIdUrl);
      }
      if (applicationCopy.birTinUrl) {
        applicationCopy.birTinUrl = this.fixDocumentUrl(applicationCopy.birTinUrl);
      }
      if (applicationCopy.dtiOrSecUrl) {
        applicationCopy.dtiOrSecUrl = this.fixDocumentUrl(applicationCopy.dtiOrSecUrl);
      }

      return {
        status: applicationCopy.status || 'not_applied',
        application: applicationCopy,
        isVendor: user.role === 'vendor'
      };

    } catch (error) {
      console.error('Error getting application status:', error);
      throw error;
    }
  }

  /**
   * Fix document URLs for proper access
   * - Convert /image/upload/ to /raw/upload/ for PDFs
   * - Remove fl_attachment flag if present (causes 401 errors)
   * - Ensure URLs are publicly accessible
   */
  fixDocumentUrl(url) {
    if (!url) return url;
    
    let fixedUrl = url;
    
    // If it's a PDF but using image/upload, convert to raw/upload
    if (url.toLowerCase().includes('.pdf') && url.includes('/image/upload/')) {
      fixedUrl = fixedUrl.replace('/image/upload/', '/raw/upload/');
    }
    
    // Remove fl_attachment flag as it can cause 401 errors in some browsers
    if (fixedUrl.includes('/fl_attachment/')) {
      fixedUrl = fixedUrl.replace('/fl_attachment/', '/');
    }
    
    // Remove fl_attachment if it's part of other transformations
    fixedUrl = fixedUrl.replace(/,?fl_attachment,?/g, '');
    
    return fixedUrl;
  }

  /**
   * @deprecated Use fixDocumentUrl instead
   */
  fixPdfUrl(url) {
    return this.fixDocumentUrl(url);
  }

  /**
   * Admin: Get all pending seller applications
   */
  async getPendingApplications() {
    try {
      const users = await User.find({
        'sellerApplication.status': 'pending'
      }).select('name email phone sellerApplication createdAt');

      // Fix document URLs for all applications
      const fixedUsers = users.map(user => {
        const userObj = user.toObject();
        if (userObj.sellerApplication) {
          userObj.sellerApplication.governmentIdUrl = this.fixDocumentUrl(userObj.sellerApplication.governmentIdUrl);
          userObj.sellerApplication.birTinUrl = this.fixDocumentUrl(userObj.sellerApplication.birTinUrl);
          userObj.sellerApplication.dtiOrSecUrl = this.fixDocumentUrl(userObj.sellerApplication.dtiOrSecUrl);
        }
        return userObj;
      });

      return fixedUsers;
    } catch (error) {
      console.error('Error getting pending applications:', error);
      throw error;
    }
  }

  /**
   * Admin: Review seller application
   */
  async reviewApplication(applicationId, reviewerId, decision, rejectionReason = null) {
    try {
      const user = await User.findOne({
        'sellerApplication.submittedAt': { $exists: true },
        _id: applicationId
      });

      if (!user) {
        throw new Error('Application not found');
      }

      if (user.sellerApplication.status !== 'pending') {
        throw new Error('Application is not pending review');
      }

      // Update application status
      user.sellerApplication.status = decision;
      user.sellerApplication.reviewedAt = new Date();
      user.sellerApplication.reviewedBy = reviewerId;
      
      if (decision === 'rejected' && rejectionReason) {
        user.sellerApplication.rejectionReason = rejectionReason;
      }

      // If approved, upgrade user role to vendor
      if (decision === 'approved') {
        user.role = 'vendor';
      }

      await user.save();

      return {
        success: true,
        message: `Application ${decision} successfully`,
        application: user.sellerApplication
      };

    } catch (error) {
      console.error('Error reviewing application:', error);
      throw error;
    }
  }

  /**
   * Clean up old application files from Cloudinary
   */
  async cleanupOldApplicationFiles(application) {
    try {
      const filesToDelete = [];
      
      if (application.governmentIdPublicId) {
        filesToDelete.push(application.governmentIdPublicId);
      }
      if (application.birTinPublicId) {
        filesToDelete.push(application.birTinPublicId);
      }
      if (application.dtiOrSecPublicId) {
        filesToDelete.push(application.dtiOrSecPublicId);
      }

      // Delete files from Cloudinary
      for (const publicId of filesToDelete) {
        try {
          await deleteFromCloudinary(publicId);
          console.log(`Deleted old application file: ${publicId}`);
        } catch (error) {
          console.warn(`Failed to delete old application file ${publicId}:`, error.message);
        }
      }

    } catch (error) {
      console.error('Error cleaning up old application files:', error);
      // Don't throw - this is cleanup, shouldn't fail the main operation
    }
  }

  /**
   * Validate application data
   */
  validateApplicationData(data) {
    const errors = [];

    if (!data.shopName || data.shopName.trim().length < 2) {
      errors.push('Shop name is required and must be at least 2 characters long');
    }

    if (!data.shopAddress || data.shopAddress.trim().length < 5) {
      errors.push('Shop address is required and must be at least 5 characters long');
    }

    return errors;
  }

  /**
   * Cancel seller application and cleanup documents
   */
  async cancelApplication(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.sellerApplication.status !== 'pending') {
        throw new Error('Only pending applications can be cancelled');
      }

      // Clean up uploaded documents from Cloudinary
      await this.cleanupOldApplicationFiles(user.sellerApplication);

      // Reset application status and clear data
      user.sellerApplication = {
        status: 'not_applied',
        shopName: undefined,
        shopAddress: undefined,
        governmentIdUrl: undefined,
        governmentIdPublicId: undefined,
        birTinUrl: undefined,
        birTinPublicId: undefined,
        dtiOrSecUrl: undefined,
        dtiOrSecPublicId: undefined,
        rejectionReason: undefined,
        submittedAt: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined
      };

      await user.save();

      return {
        success: true,
        message: 'Seller application cancelled successfully',
        application: user.sellerApplication
      };

    } catch (error) {
      console.error('Error cancelling seller application:', error);
      throw error;
    }
  }

  /**
   * Get document URL for viewing
   * @param {string} userId - User ID
   * @param {string} docType - Document type (governmentId, birTin, dtiOrSec)
   */
  async getDocumentUrl(userId, docType) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.sellerApplication) {
        throw new Error('No seller application found for this user');
      }

      const docFieldMap = {
        governmentId: 'governmentIdUrl',
        birTin: 'birTinUrl',
        dtiOrSec: 'dtiOrSecUrl'
      };

      const urlField = docFieldMap[docType];
      if (!urlField) {
        throw new Error('Invalid document type');
      }

      const documentUrl = user.sellerApplication[urlField];
      if (!documentUrl) {
        throw new Error('Document not found');
      }

      // Fix the URL for proper access
      const fixedUrl = this.fixDocumentUrl(documentUrl);

      return {
        success: true,
        url: fixedUrl,
        type: docType
      };

    } catch (error) {
      console.error('Error getting document URL:', error);
      throw error;
    }
  }

  /**
   * Validate uploaded files
   */
  validateFiles(files) {
    const errors = [];

    if (!files.governmentId || !files.governmentId[0]) {
      errors.push('Government ID is required');
    }

    if (!files.birTin || !files.birTin[0]) {
      errors.push('BIR TIN document is required');
    }

    if (!files.dtiOrSec || !files.dtiOrSec[0]) {
      errors.push('DTI or SEC registration document is required');
    }

    return errors;
  }
}

module.exports = new SellerApplicationService();