const cron = require('node-cron');
const qrFileService = require('./qrFileService');
const logger = require('./logger');

/**
 * QR File Cleanup Cron Job
 * Runs every 6 hours to clean up expired QR code files
 */

function startQRFileCleanupCron() {
  // Run every 6 hours (at 00:00, 06:00, 12:00, 18:00)
  const cronSchedule = '0 */6 * * *';
  
  logger.info('Starting QR file cleanup cron job');
  
  const job = cron.schedule(cronSchedule, async () => {
    logger.info('Running scheduled QR file cleanup...');
    
    try {
      await qrFileService.cleanupExpiredFiles();
      
      // Log directory stats after cleanup
      const stats = await qrFileService.getDirectoryStats();
      logger.info('QR directory stats after cleanup:', {
        fileCount: stats.fileCount,
        totalSizeMB: stats.totalSizeMB
      });
      
    } catch (error) {
      logger.error('Error in QR file cleanup cron job:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Manila'
  });

  logger.info(`QR file cleanup cron job scheduled with pattern: ${cronSchedule}`);
  
  // Run initial cleanup on startup
  setTimeout(async () => {
    logger.info('Running initial QR file cleanup...');
    try {
      await qrFileService.cleanupExpiredFiles();
    } catch (error) {
      logger.error('Error in initial QR file cleanup:', error);
    }
  }, 5000); // Wait 5 seconds after server start
  
  return job;
}

module.exports = {
  startQRFileCleanupCron
};