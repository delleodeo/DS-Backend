const cron = require('node-cron');
const { cleanupOldTempImages } = require('../modules/upload/upload.service');

/**
 * Cron job to cleanup temporary images older than 24 hours
 * Runs every day at 2:00 AM
 */
function startImageCleanupCron() {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Image Cleanup Cron] Running temporary image cleanup...');
    
    try {
      const result = await cleanupOldTempImages(24); // 24 hours
      console.log(`[Image Cleanup Cron] ${result.message}`);
      
      if (result.deleted > 0) {
        console.log(`[Image Cleanup Cron] Deleted ${result.deleted} temporary images`);
      }
      
      if (result.failed > 0) {
        console.warn(`[Image Cleanup Cron] Failed to delete ${result.failed} images`);
      }
    } catch (error) {
      console.error('[Image Cleanup Cron] Error during cleanup:', error);
    }
  });

  console.log('[Image Cleanup Cron] Scheduled to run daily at 2:00 AM');
}

/**
 * Manual cleanup function for testing or manual execution
 * @param {number} hours - Age threshold in hours (default: 24)
 */
async function manualCleanup(hours = 24) {
  console.log(`[Manual Cleanup] Cleaning up temporary images older than ${hours} hours...`);
  
  try {
    const result = await cleanupOldTempImages(hours);
    console.log(`[Manual Cleanup] ${result.message}`);
    return result;
  } catch (error) {
    console.error('[Manual Cleanup] Error:', error);
    throw error;
  }
}

module.exports = {
  startImageCleanupCron,
  manualCleanup
};
