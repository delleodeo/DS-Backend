const cron = require('node-cron');
const { deactivateExpiredPromotions } = require('../modules/products/product-promotions/promotion.service.js');
const logger = require('./logger');

/**
 * Start the promotion expiration cron job
 * Runs every hour to check and deactivate expired promotions
 */
function startPromotionExpirationCron() {
  // Run every 15 minutes for more timely promotion expiration handling
  cron.schedule('*/15 * * * *', async () => {
    try {
      logger.info('[Promotion Cron] Starting expired promotion check...');
      const result = await deactivateExpiredPromotions();
      if (result.total > 0) {
        logger.info(`[Promotion Cron] Completed. Deactivated ${result.total} promotions`);
      }
    } catch (error) {
      logger.error('[Promotion Cron] Error checking expired promotions:', error);
    }
  });
  
  logger.info('[Promotion Cron] Promotion expiration cron job scheduled (runs every 15 minutes)');
}

/**
 * Manually trigger promotion expiration check
 * Useful for testing or manual cleanup
 */
async function manualPromotionExpiration() {
  try {
    logger.info('[Manual Promotion Check] Starting...');
    const result = await deactivateExpiredPromotions();
    logger.info(`[Manual Promotion Check] Completed. Deactivated ${result.total} promotions`);
    return result;
  } catch (error) {
    logger.error('[Manual Promotion Check] Error:', error);
    throw error;
  }
}

module.exports = {
  startPromotionExpirationCron,
  manualPromotionExpiration,
};
