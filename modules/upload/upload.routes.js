// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { uploadTemp, uploadPermanent } = require('./upload.service');
const uploadController = require('./upload.controller');

// Legacy upload endpoint (backward compatible)
router.post('/', uploadTemp.array('images', 10), uploadController.uploadImages);

// Temporary upload (for images that may be rolled back)
router.post('/temp', uploadTemp.array('images', 10), uploadController.uploadTempImages);

// Permanent upload (for confirmed images)
router.post('/permanent', uploadPermanent.array('images', 10), uploadController.uploadPermanentImages);

// Delete single image from Cloudinary
router.delete('/delete', uploadController.deleteImage);

// Delete multiple images from Cloudinary
router.delete('/delete-batch', uploadController.deleteBatchImages);

// Mark temporary images as permanent
router.post('/confirm', uploadController.confirmImages);

module.exports = router;
