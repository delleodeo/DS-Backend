/**
 * Subscription Expiration Cron Job
 * Automatically expires subscriptions that have reached their period end
 * Runs daily at midnight
 */
const cron = require('node-cron');
const subscriptionService = require('../modules/subscription/subscription.service');

/**
 * Process subscription expirations
 */
const processSubscriptionExpirations = async () => {
  console.log('[SubscriptionExpireCron] Starting subscription expiration job...');

  try {
    await subscriptionService.expireJob();
    console.log('[SubscriptionExpireCron] Subscription expiration job completed successfully');
  } catch (error) {
    console.error('[SubscriptionExpireCron] Error in subscription expiration job:', error);
  }
};

/**
 * Start the subscription expiration cron job
 * Runs daily at midnight (00:00)
 */
const startSubscriptionExpireCron = () => {
  // Schedule to run daily at midnight
  cron.schedule('0 0 * * *', async () => {
    await processSubscriptionExpirations();
  });

  console.log('✅ Subscription expiration cron job scheduled (daily at midnight)');
};

/**
 * Manual trigger for testing
 */
const runSubscriptionExpireManually = async () => {
  console.log('[SubscriptionExpireCron] Manual trigger started...');
  await processSubscriptionExpirations();
  console.log('[SubscriptionExpireCron] Manual trigger completed.');
};

module.exports = {
  startSubscriptionExpireCron,
  runSubscriptionExpireManually,
  processSubscriptionExpirations
};