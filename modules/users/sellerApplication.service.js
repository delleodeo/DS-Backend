const User = require('./users.model');
const Vendor = require('../vendors/vendors.model');
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
        shopName: applicationData.shopName?.trim(),
        shopAddress: applicationData.shopAddress?.trim(),
        address: {
          // Store display names
          region: applicationData.region?.trim(),
          province: applicationData.province?.trim(),
          municipality: applicationData.municipality?.trim(),
          barangay: applicationData.barangay?.trim(),
          zipCode: applicationData.zipCode?.trim(),
          street: applicationData.street?.trim() || '',
          additionalInfo: applicationData.additionalInfo?.trim() || '',
          // Also store codes for reference/lookup
          regionCode: applicationData.regionCode?.trim() || '',
          provinceCode: applicationData.provinceCode?.trim() || '',
          municipalityCode: applicationData.municipalityCode?.trim() || '',
          barangayCode: applicationData.barangayCode?.trim() || ''
        },
        status: 'pending',
        submittedAt: new Date()
      };

      // Keep backward-compatible formatted address for legacy UI
      const composedAddressParts = [
        sellerApplication.address.street,
        sellerApplication.address.barangay,
        sellerApplication.address.municipality,
        sellerApplication.address.province,
        sellerApplication.address.region,
        sellerApplication.address.zipCode
      ].filter(Boolean);
      if (composedAddressParts.length) {
        sellerApplication.shopAddress = composedAddressParts.join(', ');
      }

      // Add file URLs and public IDs if files were uploaded
      if (files?.shopProfile && files.shopProfile[0]) {
        sellerApplication.shopProfileUrl = files.shopProfile[0].path;
        sellerApplication.shopProfilePublicId = files.shopProfile[0].filename;
      }

      if (files?.governmentId && files.governmentId[0]) {
        sellerApplication.governmentIdUrl = files.governmentId[0].path;
        sellerApplication.governmentIdPublicId = files.governmentId[0].filename;
      }

      if (files?.birTin && files.birTin[0]) {
        sellerApplication.birTinUrl = files.birTin[0].path;
        sellerApplication.birTinPublicId = files.birTin[0].filename;
      }

      if (files?.dtiOrSec && files.dtiOrSec[0]) {
        sellerApplication.dtiOrSecUrl = files.dtiOrSec[0].path;
        sellerApplication.dtiOrSecPublicId = files.dtiOrSec[0].filename;
      }

      if (files?.fdaCertificate && files.fdaCertificate[0]) {
        sellerApplication.fdaCertificateUrl = files.fdaCertificate[0].path;
        sellerApplication.fdaCertificatePublicId = files.fdaCertificate[0].filename;
      }

      // Add shop location if coordinates provided
      const shopLat = parseFloat(applicationData.shopLatitude);
      const shopLng = parseFloat(applicationData.shopLongitude);
      if (!isNaN(shopLat) && !isNaN(shopLng) && 
          shopLat >= -90 && shopLat <= 90 && 
          shopLng >= -180 && shopLng <= 180) {
        sellerApplication.shopLocation = {
          type: 'Point',
          coordinates: [shopLng, shopLat] // GeoJSON format: [longitude, latitude]
        };
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
      if (applicationCopy.fdaCertificateUrl) {
        applicationCopy.fdaCertificateUrl = this.fixDocumentUrl(applicationCopy.fdaCertificateUrl);
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
          userObj.sellerApplication.fdaCertificateUrl = this.fixDocumentUrl(userObj.sellerApplication.fdaCertificateUrl);
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

      // If approved, upgrade user role to vendor and create vendor profile
      if (decision === 'approved') {
        user.role = 'vendor';
        
        // Check if vendor profile already exists
        const existingVendor = await Vendor.findOne({ userId: user._id });
        
        if (!existingVendor) {
          // Create vendor profile from application data
          const vendorData = {
            userId: user._id,
            storeName: user.sellerApplication.shopName,
            address: {
              street: user.sellerApplication.address?.street || user.sellerApplication.shopAddress || '',
              barangay: user.sellerApplication.address?.barangay || user.address?.barangay || '',
              city: user.sellerApplication.address?.municipality || user.address?.city || '',
              province: user.sellerApplication.address?.province || user.address?.province || '',
              region: user.sellerApplication.address?.region || user.address?.province || '',
              zipCode: user.sellerApplication.address?.zipCode || user.address?.zipCode || '',
              additionalInfo: user.sellerApplication.address?.additionalInfo || ''
            },
            phoneNumber: user.phone || '',
            isApproved: true,
            documentsSubmitted: true,
            documents: [
              user.sellerApplication.governmentIdUrl,
              user.sellerApplication.birTinUrl,
              user.sellerApplication.dtiOrSecUrl,
              user.sellerApplication.fdaCertificateUrl
            ].filter(Boolean), // Remove empty values
            // Set shop profile image from application
            imageUrl: user.sellerApplication.shopProfileUrl || null,
            // Set shop location from application if available
            location: user.sellerApplication.shopLocation?.coordinates?.length === 2
              ? {
                  type: 'Point',
                  coordinates: user.sellerApplication.shopLocation.coordinates
                }
              : undefined,
            // Initialize dashboard stats
            totalProducts: 0,
            totalOrders: 0,
            totalRevenue: 0,
            profileViews: 0,
            productClicks: 0,
            currentMonthlyRevenue: 0
          };
          
          const vendor = new Vendor(vendorData);
          await vendor.save();
          
          console.log(`✅ Created vendor profile for user ${user.name} (${user.email})`);
          if (vendorData.location) {
            console.log(`   📍 Shop location set: [${vendorData.location.coordinates.join(', ')}]`);
          }
          if (vendorData.imageUrl) {
            console.log(`   🖼️ Shop profile image set`);
          }
        } else {
          console.log(`Vendor profile already exists for user ${user.name} (${user.email})`);
        }
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
      if (application.fdaCertificatePublicId) {
        filesToDelete.push(application.fdaCertificatePublicId);
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

    if (!data.region || data.region.trim().length < 2) {
      errors.push('Region is required');
    }

    if (!data.province || data.province.trim().length < 2) {
      errors.push('Province is required');
    }

    if (!data.municipality || data.municipality.trim().length < 2) {
      errors.push('Municipality / City is required');
    }

    if (!data.barangay || data.barangay.trim().length < 2) {
      errors.push('Barangay is required');
    }

    if (!data.zipCode || data.zipCode.toString().trim().length < 3) {
      errors.push('Zip code is required');
    }

    if (data.street && data.street.length > 150) {
      errors.push('Street must be 150 characters or fewer');
    }

    if (data.additionalInfo && data.additionalInfo.length > 300) {
      errors.push('Additional information must be 300 characters or fewer');
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
        address: undefined,
        governmentIdUrl: undefined,
        governmentIdPublicId: undefined,
        birTinUrl: undefined,
        birTinPublicId: undefined,
        dtiOrSecUrl: undefined,
        dtiOrSecPublicId: undefined,
        fdaCertificateUrl: undefined,
        fdaCertificatePublicId: undefined,
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
        dtiOrSec: 'dtiOrSecUrl',
        fdaCertificate: 'fdaCertificateUrl'
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

    if (!files) {
      errors.push('No files uploaded');
      return errors;
    }

    if (!files.governmentId || !files.governmentId[0]) {
      errors.push('Government ID is required');
    }

    if (!files.birTin || !files.birTin[0]) {
      errors.push('BIR TIN document is required');
    }

    if (!files.dtiOrSec || !files.dtiOrSec[0]) {
      errors.push('DTI or SEC registration document is required');
    }

    // FDA certificate is optional; if provided, allow it

    return errors;
  }

  /**
   * Create vendor profiles for existing approved sellers who don't have them
   * This is a utility method to fix existing data
   */
  async createMissingVendorProfiles() {
    try {
      // Find users with approved seller applications but no vendor profile
      const approvedUsers = await User.find({
        $or: [
          { role: 'vendor' },
          { 'sellerApplication.status': 'approved' }
        ]
      });

      let created = 0;
      let existing = 0;

      for (const user of approvedUsers) {
        // Check if vendor profile exists
        const existingVendor = await Vendor.findOne({ userId: user._id });
        
        if (existingVendor) {
          existing++;
          continue;
        }

        // Create vendor profile
        const vendorData = {
          userId: user._id,
          storeName: user.sellerApplication?.shopName || user.name || 'Unknown Store',
          address: {
              street: user.sellerApplication?.address?.street || user.sellerApplication?.shopAddress || '',
              barangay: user.sellerApplication?.address?.barangay || user.address?.barangay || '',
              city: user.sellerApplication?.address?.municipality || user.address?.city || '',
              province: user.sellerApplication?.address?.region || user.address?.province || '',
              region: user.sellerApplication?.address?.region || user.address?.province || '',
              zipCode: user.sellerApplication?.address?.zipCode || user.address?.zipCode || '',
              additionalInfo: user.sellerApplication?.address?.additionalInfo || ''
          },
          phoneNumber: user.phone || '',
          isApproved: true,
          documentsSubmitted: !!user.sellerApplication?.governmentIdUrl,
          documents: [
            user.sellerApplication?.governmentIdUrl,
            user.sellerApplication?.birTinUrl,
              user.sellerApplication?.dtiOrSecUrl,
              user.sellerApplication?.fdaCertificateUrl
          ].filter(Boolean),
          totalProducts: 0,
          totalOrders: 0,
          totalRevenue: 0,
          profileViews: 0,
          productClicks: 0,
          currentMonthlyRevenue: 0
        };
        
        const vendor = new Vendor(vendorData);
        await vendor.save();
        
        // Ensure user role is set to vendor
        if (user.role !== 'vendor') {
          user.role = 'vendor';
          await user.save();
        }
        
        created++;
        console.log(`✅ Created missing vendor profile for ${user.name} (${user.email})`);
      }

      return {
        success: true,
        message: `Created ${created} vendor profiles, ${existing} already existed`,
        created,
        existing
      };

    } catch (error) {
      console.error('Error creating missing vendor profiles:', error);
      throw error;
    }
  }
}

module.exports = new SellerApplicationService();