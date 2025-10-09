// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const upload = require('./upload.service');
const uploadController = require('./upload.controller');

router.post('/', upload.array('images', 10), uploadController.uploadImages);

module.exports = router;
