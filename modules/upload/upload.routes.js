// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { uploadTemp, uploadPermanent, tempUploadHandler, permanentUploadHandler } = require('./upload.service');
const uploadController = require('./upload.controller');

// Legacy upload endpoint (backward compatible)
router.post('/', uploadTemp.array('images', 10), tempUploadHandler, uploadController.uploadImages);

// Temporary upload (for images that may be rolled back)
router.post('/temp', uploadTemp.array('images', 10), tempUploadHandler, uploadController.uploadTempImages);

// Permanent upload (for confirmed images)
router.post('/permanent', uploadPermanent.array('images', 10), permanentUploadHandler, uploadController.uploadPermanentImages);

// Delete single image from Cloudinary
router.delete('/delete', uploadController.deleteImage);

// Delete multiple images from Cloudinary
router.delete('/delete-batch', uploadController.deleteBatchImages);

// Mark temporary images as permanent
router.post('/confirm', uploadController.confirmImages);

module.exports = router;
