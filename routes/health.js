const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isRedisAvailable } = require('../config/redis');

router.get('/health', async (req, res) => {
  try {
    // Check MongoDB
    const mongoStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';

    // Check Redis
    const redisStatus = isRedisAvailable() ? 'healthy' : 'degraded';

    const overallStatus = mongoStatus === 'healthy' ? 'healthy' : 'unhealthy';

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoStatus,
        redis: redisStatus
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

router.get('/health/ready', async (req, res) => {
  try {
    // Check if MongoDB is ready
    const isReady = mongoose.connection.readyState === 1;
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;