const { deleteFromCloudinary, deleteBatchFromCloudinary, markAsPermanent } = require('./upload.service');

/**
 * Upload images temporarily (marked for potential rollback)
 * Images are tagged as 'temp' and can be deleted if product creation fails
 */
exports.uploadTempImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) 
        return res.status(400).json({ error: 'No images uploaded.' });

    const uploadedImages = req.files.map(file => ({
      url: file.path,           
      public_id: file.filename,
      width: file.width,
      height: file.height,
      format: file.format,
      bytes: file.bytes,
      temporary: true
    }));

    return res.status(200).json({
      message: 'Images uploaded successfully (temporary).',
      images: uploadedImages,
      sessionId: req.headers['x-session-id'] || 'default'
    });
  } catch (err) {
    console.error('[Upload Temp Error]', err);
    return res.status(500).json({ error: 'Something went wrong during upload.' });
  }
};

/**
 * Upload images permanently (for immediate permanent storage)
 */
exports.uploadPermanentImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) 
        return res.status(400).json({ error: 'No images uploaded.' });

    const uploadedImages = req.files.map(file => ({
      url: file.path,           
      public_id: file.filename,
      width: file.width,
      height: file.height,
      format: file.format,
      bytes: file.bytes,
      temporary: false
    }));

    return res.status(200).json({
      message: 'Images uploaded successfully.',
      images: uploadedImages,
    });
  } catch (err) {
    console.error('[Upload Permanent Error]', err);
    return res.status(500).json({ error: 'Something went wrong during upload.' });
  }
};

/**
 * Legacy upload endpoint (backward compatible)
 */
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) 
        return res.status(400).json({ error: 'No images uploaded.' });

    const uploadedImages = req.files.map(file => ({
      url: file.path,           
      public_id: file.filename, 
    }));

    return res.status(200).json({
      message: 'Images uploaded successfully.',
      images: uploadedImages,
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    return res.status(500).json({ error: 'Something went wrong during upload.' });
  }
};

/**
 * Delete a single image from Cloudinary
 * @body {string} publicId - Cloudinary public_id of the image to delete
 */
exports.deleteImage = async (req, res) => {
  try {
    const { publicId } = req.body;
    
    if (!publicId) {
      return res.status(400).json({ error: 'publicId is required.' });
    }

    const result = await deleteFromCloudinary(publicId);
    
    if (result.success) {
      return res.status(200).json({
        message: 'Image deleted successfully.',
        publicId,
        result: result.result
      });
    } else {
      return res.status(400).json({
        error: 'Failed to delete image.',
        result: result.result
      });
    }
  } catch (err) {
    console.error('[Delete Image Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to delete image.' });
  }
};

/**
 * Delete multiple images from Cloudinary
 * @body {string[]} publicIds - Array of Cloudinary public_ids
 */
exports.deleteBatchImages = async (req, res) => {
  try {
    const { publicIds } = req.body;
    
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({ error: 'publicIds array is required.' });
    }

    const result = await deleteBatchFromCloudinary(publicIds);
    
    return res.status(200).json({
      message: `Deleted ${result.successful} images successfully.`,
      successful: result.successful,
      failed: result.failed,
      total: result.total,
    });
  } catch (err) {
    console.error('[Delete Batch Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to delete images.' });
  }
};

/**
 * Mark temporary images as permanent (called after successful product creation)
 * @body {string[]} publicIds - Array of Cloudinary public_ids to mark as permanent
 */
exports.confirmImages = async (req, res) => {
  try {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({ error: 'publicIds array is required.' });
    }

    const results = await Promise.allSettled(
      publicIds.map(id => markAsPermanent(id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    return res.status(200).json({
      message: `Confirmed ${successful} images as permanent.`,
      successful,
      failed,
      total: results.length,
    });
  } catch (err) {
    console.error('[Confirm Images Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to confirm images.' });
  }
};

/**
 * Upload a single profile image
 * Returns the URL of the uploaded image
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }

    return res.status(200).json({
      message: 'Profile image uploaded successfully.',
      imageUrl: req.file.path,
      url: req.file.path,
      public_id: req.file.filename,
      width: req.file.width,
      height: req.file.height,
      format: req.file.format,
      bytes: req.file.bytes,
    });
  } catch (err) {
    console.error('[Upload Profile Image Error]', err);
    return res.status(500).json({ error: 'Something went wrong during upload.' });
  }
};
