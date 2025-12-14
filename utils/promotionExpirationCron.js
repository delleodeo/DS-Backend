const cron = require('node-cron');
const { deactivateExpiredPromotions } = require('../modules/products/promotion.service.js');

/**
 * Start the promotion expiration cron job
 * Runs every hour to check and deactivate expired promotions
 */
function startPromotionExpirationCron() {
  // Run every 15 minutes for more timely promotion expiration handling
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('[Promotion Cron] Starting expired promotion check...');
      const result = await deactivateExpiredPromotions();
      if (result.total > 0) {
        console.log(`[Promotion Cron] Completed. Deactivated ${result.total} promotions`);
      }
    } catch (error) {
      console.error('[Promotion Cron] Error checking expired promotions:', error);
    }
  });
  
  console.log('[Promotion Cron] Promotion expiration cron job scheduled (runs every 15 minutes)');
}

/**
 * Manually trigger promotion expiration check
 * Useful for testing or manual cleanup
 */
async function manualPromotionExpiration() {
  try {
    console.log('[Manual Promotion Check] Starting...');
    const result = await deactivateExpiredPromotions();
    console.log(`[Manual Promotion Check] Completed. Deactivated ${result.total} promotions`);
    return result;
  } catch (error) {
    console.error('[Manual Promotion Check] Error:', error);
    throw error;
  }
}

module.exports = {
  startPromotionExpirationCron,
  manualPromotionExpiration,
};
