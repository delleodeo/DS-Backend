require("dotenv").config();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage for multer and stream uploads to Cloudinary
const memoryStorage = multer.memoryStorage();

/**
 * Helper to upload a buffer to Cloudinary via upload_stream
 * @param {Buffer} buffer
 * @param {Object} options - cloudinary upload options (folder, resource_type, format, tags, transformation, public_id, context)
 */
function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

// Multer instances using memoryStorage
const uploadDocuments = multer({
  storage: memoryStorage,
  limits: { 
    files: 5, // Shop profile, Government ID, BIR, DTI/SEC, optional FDA certificate
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg', 
      'image/jpg', 
      'image/png',
      'application/pdf'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG images and PDF files are allowed for seller documents'), false);
  }
});

const uploadTemp = multer({
  storage: memoryStorage,
  limits: { files: 10, fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

const uploadPermanent = multer({
  storage: memoryStorage,
  limits: { files: 10, fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

/**
 * Delete image from Cloudinary by public_id
 * @param {string} publicId - Cloudinary public_id of the image
 * @returns {Promise<Object>} - Deletion result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { success: result.result === 'ok', result };
  } catch (error) {
    console.error('[Cloudinary Delete Error]', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} publicIds - Array of public_ids
 * @returns {Promise<Object>} - Batch deletion result
 */
async function deleteBatchFromCloudinary(publicIds) {
  try {
    console.log(`[Cloudinary Batch Delete] Attempting to delete ${publicIds.length} images:`, publicIds);
    
    const results = await Promise.allSettled(
      publicIds.map(id => {
        console.log(`[Cloudinary Delete] Deleting image with public_id: ${id}`);
        return cloudinary.uploader.destroy(id);
      })
    );
    
    const successful = [];
    const failed = [];
    
    results.forEach((result, index) => {
      const publicId = publicIds[index];
      if (result.status === 'fulfilled') {
        if (result.value.result === 'ok') {
          successful.push(publicId);
          console.log(`[Cloudinary Delete] Successfully deleted: ${publicId}`);
        } else if (result.value.result === 'not found') {
          console.warn(`[Cloudinary Delete] Image not found: ${publicId}`);
          failed.push({ publicId, reason: 'not found', detail: result.value });
        } else {
          console.warn(`[Cloudinary Delete] Unexpected result for ${publicId}:`, result.value);
          failed.push({ publicId, reason: result.value.result, detail: result.value });
        }
      } else {
        console.error(`[Cloudinary Delete] Failed to delete ${publicId}:`, result.reason);
        failed.push({ publicId, reason: 'error', error: result.reason });
      }
    });
    
    return { 
      successful: successful.length, 
      failed: failed.length, 
      total: results.length,
      successfulIds: successful,
      failedDetails: failed,
      details: results 
    };
  } catch (error) {
    console.error('[Cloudinary Batch Delete Error]', error);
    throw new Error(`Failed to delete images: ${error.message}`);
  }
}

// Safe wrapper that never throws - returns aggregated result even on full failures
async function safeDeleteBatch(publicIds) {
  try {
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return { successful: 0, failed: 0, total: 0, successfulIds: [], failedDetails: [] };
    }

    const result = await deleteBatchFromCloudinary(publicIds).catch((err) => {
      console.error('[Safe Cloudinary Delete] Underlying delete error:', err.message);
      return { successful: 0, failed: publicIds.length, total: publicIds.length, successfulIds: [], failedDetails: publicIds.map(id => ({ publicId: id, reason: 'error', error: err.message })) };
    });

    return result;
  } catch (err) {
    console.error('[Safe Cloudinary Delete] Unexpected error:', err);
    return { successful: 0, failed: publicIds.length || 0, total: publicIds.length || 0, successfulIds: [], failedDetails: publicIds.map(id => ({ publicId: id, reason: 'error', error: err.message })) };
  }
}

/**
 * Middleware: Upload files (req.file or req.files) to Cloudinary using memory buffers
 * type: 'temp'|'permanent'|'document'
 */
function makeUploadHandler(type = 'temp') {
  return async function (req, res, next) {
    try {
      const sessionId = req.headers['x-session-id'] || `session_${Date.now()}`;

      const uploadOne = async (file) => {
        const isPdf = file.mimetype === 'application/pdf';
        const timestamp = Date.now();
        const baseOptions = {};

        if (type === 'temp') {
          baseOptions.folder = 'DoroShop-Images/temp';
          baseOptions.format = 'webp';
          baseOptions.transformation = [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }];
          baseOptions.tags = ['temp', sessionId];
          baseOptions.context = `temp=true|session=${sessionId}|created=${timestamp}`;
        } else if (type === 'permanent') {
          baseOptions.folder = 'DoroShop-Images/products';
          baseOptions.format = 'webp';
          baseOptions.transformation = [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }];
          baseOptions.tags = ['permanent', 'product'];
          baseOptions.context = 'temp=false';
        } else if (type === 'document') {
          const userId = req.user?.id || req.user?._id || 'anon';
          baseOptions.folder = `DoroShop-Documents/seller-applications/${userId}`;
          baseOptions.tags = ['seller-application', userId ? `user-${userId}` : 'temp'];
          baseOptions.context = `temp=false|user=${userId}|type=seller-document|created=${timestamp}`;
          baseOptions.public_id = `${file.fieldname}_${timestamp}`;
          if (isPdf) baseOptions.resource_type = 'raw';
        }

        // Allow tests to spy/mock the exported upload function by resolving at runtime from module.exports
        const uploader = (module.exports && module.exports.uploadBufferToCloudinary) ? module.exports.uploadBufferToCloudinary : uploadBufferToCloudinary;
        const result = await uploader(file.buffer, baseOptions);
        // Attach expected properties to file object for downstream code compatibility
        file.path = result.secure_url || result.url;
        file.filename = result.public_id;
        file.width = result.width;
        file.height = result.height;
        file.format = result.format;
        file.bytes = result.bytes || file.size;
        return file;
      };

      if (req.file && req.file.buffer) {
        await uploadOne(req.file);
      }

      if (req.files && Array.isArray(req.files)) {
        for (let i = 0; i < req.files.length; i++) {
          if (req.files[i] && req.files[i].buffer) {
            await uploadOne(req.files[i]);
          }
        }
      }

      if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
        // multer.fields result: req.files is object with arrays
        for (const key of Object.keys(req.files)) {
          for (let i = 0; i < req.files[key].length; i++) {
            const f = req.files[key][i];
            if (f && f.buffer) await uploadOne(f);
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

const tempUploadHandler = makeUploadHandler('temp');
const permanentUploadHandler = makeUploadHandler('permanent');
const documentUploadHandler = makeUploadHandler('document');

/**
 * Mark temporary image as permanent
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>} - Update result
 */
async function markAsPermanent(publicId) {
  try {
    // Remove temp tag and update context
    const result = await cloudinary.uploader.explicit(publicId, {
      type: 'upload',
      tags: ['permanent', 'product'],
      context: 'temp=false',
    });
    return { success: true, result };
  } catch (error) {
    console.error('[Cloudinary Update Error]', error);
    throw new Error(`Failed to mark image as permanent: ${error.message}`);
  }
}

/**
 * Find and cleanup temporary images older than specified hours
 * @param {number} hours - Age threshold in hours (default: 24)
 * @returns {Promise<Object>} - Cleanup result
 */
async function cleanupOldTempImages(hours = 24) {
  try {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    // Search for temp images
    const result = await cloudinary.api.resources_by_tag('temp', {
      type: 'upload',
      max_results: 500,
      context: true,
    });
    
    const oldImages = result.resources.filter(resource => {
      if (!resource.context?.custom?.created) return false;
      const created = parseInt(resource.context.custom.created);
      return created < cutoffTime;
    });
    
    if (oldImages.length === 0) {
      return { deleted: 0, message: 'No old temporary images found' };
    }
    
    const publicIds = oldImages.map(img => img.public_id);
    const deleteResult = await deleteBatchFromCloudinary(publicIds);
    
    return {
      deleted: deleteResult.successful,
      failed: deleteResult.failed,
      message: `Cleaned up ${deleteResult.successful} old temporary images`,
    };
  } catch (error) {
    console.error('[Cleanup Error]', error);
    throw new Error(`Failed to cleanup temp images: ${error.message}`);
  }
}

/**
 * Extract public_id from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} - Extracted public_id or null
 */
function extractPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Cloudinary URL formats:
    // https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{public_id}.{format}
    // https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/v{version}/{public_id}.{format}
    // https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{transformations}/{public_id}.{format}
    // public_id can include folders: products/temp/image_abc123
    
    // Find the /upload/ segment
    const uploadMatch = url.match(/\/upload\/(.*)/);
    if (!uploadMatch) return null;
    
    let pathAfterUpload = uploadMatch[1];
    
    // Remove version number if present (v followed by digits and /)
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '');
    
    // Remove transformation parameters (anything containing commas or starting with w_, h_, c_, etc.)
    // Transformations are in the format: w_500,h_300,c_fill/ or w_500/h_300/
    const transformationPattern = /^(?:[a-z]_[^/,]+(?:,[a-z]_[^/,]+)*\/)+/;
    pathAfterUpload = pathAfterUpload.replace(transformationPattern, '');
    
    // Remove file extension from the end
    pathAfterUpload = pathAfterUpload.replace(/\.[^/.]+$/, '');
    
    // What remains should be the public_id (can include folder paths)
    return pathAfterUpload || null;
  } catch (error) {
    console.error('[Extract Public ID Error]', error);
    return null;
  }
}

/**
 * Generate a signed URL for secure document access
 * @param {string} publicId - The Cloudinary public_id of the document
 * @param {string} resourceType - 'image' or 'raw' (for PDFs)
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {string} - Signed URL
 */
function generateSignedUrl(publicId, resourceType = 'image', expiresIn = 3600) {
  try {
    const timestamp = Math.round(Date.now() / 1000) + expiresIn;
    
    const options = {
      type: 'authenticated',
      sign_url: true,
      expires_at: timestamp,
      resource_type: resourceType,
    };
    
    // For PDFs, we need to handle raw resource type
    if (publicId.includes('.pdf') || resourceType === 'raw') {
      options.resource_type = 'raw';
    }
    
    return cloudinary.url(publicId, options);
  } catch (error) {
    console.error('[Generate Signed URL Error]', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Get a public URL for a document (no authentication required for public resources)
 * @param {string} url - Original Cloudinary URL
 * @returns {string} - URL suitable for viewing
 */
function getDocumentViewUrl(url) {
  if (!url) return null;
  
  // For PDFs uploaded to Cloudinary, ensure proper format
  if (url.includes('.pdf')) {
    // PDFs should be accessed directly
    return url;
  }
  
  // For images, return as-is
  return url;
}

module.exports = {
  uploadTemp,
  uploadPermanent,
  uploadDocuments,
  tempUploadHandler,
  permanentUploadHandler,
  documentUploadHandler,
  deleteFromCloudinary,
  deleteBatchFromCloudinary,
  safeDeleteBatch,
  markAsPermanent,
  cleanupOldTempImages,
  extractPublicIdFromUrl,
  generateSignedUrl,
  getDocumentViewUrl,
  cloudinary,
  uploadBufferToCloudinary // exported for unit testing if needed
};
