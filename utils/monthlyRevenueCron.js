const cron = require("node-cron");
const vendorService = require("../modules/vendors/vendors.service");

/**
 * Cron job to reset currentMonthlyRevenue for all vendors
 * Runs at 12:01 AM on the 1st of every month
 * Cron expression: "1 0 1 * *"
 * This resets the currentMonthlyRevenue counter for the new month
 * Note: Revenue is now pushed to monthlyRevenueComparison immediately on each sale
 */
const startMonthlyRevenueCron = () => {
	// Run at 12:01 AM on the 1st of every month
	cron.schedule("1 0 1 * *", async () => {
		console.log(`[${new Date().toISOString()}] Starting monthly revenue reset for new month...`);
		
		try {
			const result = await vendorService.batchResetMonthlyRevenue();
			console.log(`[${new Date().toISOString()}] Monthly revenue reset completed:`, result);
		} catch (error) {
			console.error(`[${new Date().toISOString()}] Error resetting monthly revenue:`, error);
		}
	});

	console.log("✅ Monthly revenue cron job started - resets currentMonthlyRevenue on 1st of each month");
};

module.exports = { startMonthlyRevenueCron };
