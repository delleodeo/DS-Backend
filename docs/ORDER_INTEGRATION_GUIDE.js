/**
 * INTEGRATION GUIDE: Update Vendor Revenue on Order Completion
 * 
 * This file shows you exactly where and how to add the revenue tracking
 * in your existing orders.service.js file
 */

/**
 * STEP 1: Add this import at the top of orders.service.js
 */
const Vendor = require("../vendors/vendors.model");

/**
 * STEP 2: Add this helper function to orders.service.js
 * (Place it near the top with other helper functions)
 */
const updateVendorRevenue = async (vendorId, orderAmount) => {
	try {
		const vendor = await Vendor.findOne({ userId: vendorId });
		
		if (!vendor) {
			console.warn(`Vendor not found: ${vendorId}`);
			return;
		}

		// Update current month revenue (will be auto-pushed at month end)
		vendor.currentMonthlyRevenue += orderAmount;
		
		// Update total revenue
		vendor.totalRevenue += orderAmount;
		
		// Update total orders count
		vendor.totalOrders += 1;

		await vendor.save();

		// Clear vendor cache
		await redisClient.del(`vendor:${vendorId}`);

		console.log(`✅ Revenue updated for vendor ${vendorId}: +${orderAmount}`);
	} catch (error) {
		console.error("Error updating vendor revenue:", error);
		// Don't throw error to prevent order completion failure
	}
};

/**
 * STEP 3: Modify your updateOrderStatusService function
 * 
 * FIND THIS SECTION in your orders.service.js (around line 253-260):
 */

/*
	if (newStatus === "delivered") {
		order.paymentStatus = "Paid"; // auto-mark COD as paid when delivered

		// Update stock and sold counts for each item in the order
		for (const item of order.items) {
			const productId = item.productId || item.orderProductId;
			if (productId) {
				await updateProductStock(productId, item.optionId, item.quantity);
			} else {
				console.error("Product ID not found for an item in order:", order._id);
			}
		}
	}
*/

/**
 * REPLACE IT WITH THIS (adds vendor revenue update):
 */

if (newStatus === "delivered") {
	order.paymentStatus = "Paid"; // auto-mark COD as paid when delivered

	// Update stock and sold counts for each item in the order
	for (const item of order.items) {
		const productId = item.productId || item.orderProductId;
		if (productId) {
			await updateProductStock(productId, item.optionId, item.quantity);
		} else {
			console.error("Product ID not found for an item in order:", order._id);
		}
	}

	// ✅ NEW: Update vendor revenue when order is delivered
	if (order.vendorId && order.total) {
		await updateVendorRevenue(order.vendorId, order.total);
	}
}

/**
 * ALTERNATIVE: If you want to update revenue on "paid" status instead of "delivered"
 * 
 * FIND THIS SECTION (around line 263-265):
 */

/*
	if (newStatus === "paid") {
		order.paymentStatus = "Paid";
	}
*/

/**
 * REPLACE IT WITH:
 */

if (newStatus === "paid") {
	order.paymentStatus = "Paid";
	
	// ✅ NEW: Update vendor revenue when order is paid
	if (order.vendorId && order.total) {
		await updateVendorRevenue(order.vendorId, order.total);
	}
}

/**
 * COMPLETE MODIFIED SECTION EXAMPLE:
 */

/*
exports.updateOrderStatusService = async (
	orderId,
	newStatus,
	trackingNumber = null
) => {
	const order = await Order.findById(orderId);
	if (!order) return null;

	// Validate transition
	const allowed = ALLOWED_TRANSITIONS[order.status] || [];
	if (!allowed.includes(newStatus)) {
		throw new Error(
			`Cannot change order from '${order.status}' to '${newStatus}'.`
		);
	}

	order.status = newStatus;
	order.updatedAt = Date.now();
	if (newStatus === "shipped" && trackingNumber) {
		order.trackingNumber = trackingNumber;
	}
	
	if (newStatus === "delivered") {
		order.paymentStatus = "Paid";

		// Update stock and sold counts
		for (const item of order.items) {
			const productId = item.productId || item.orderProductId;
			if (productId) {
				await updateProductStock(productId, item.optionId, item.quantity);
			} else {
				console.error("Product ID not found for an item in order:", order._id);
			}
		}

		// ✅ Update vendor revenue
		if (order.vendorId && order.total) {
			await updateVendorRevenue(order.vendorId, order.total);
		}
	}
	
	if (newStatus === "paid") {
		order.paymentStatus = "Paid";
		
		// ✅ Update vendor revenue (if you prefer to update on payment)
		// Uncomment this if you want revenue recorded when paid, not delivered
		// if (order.vendorId && order.total) {
		// 	await updateVendorRevenue(order.vendorId, order.total);
		// }
	}

	const updated = await order.save();

	// ... rest of the function (cache invalidation, etc.)
};
*/

/**
 * SUMMARY OF CHANGES:
 * 
 * 1. ✅ Import Vendor model at top
 * 2. ✅ Add updateVendorRevenue helper function
 * 3. ✅ Call updateVendorRevenue when order is delivered (or paid)
 * 
 * That's it! The monthly revenue will now:
 * - Accumulate in currentMonthlyRevenue during the month
 * - Automatically push to monthlyRevenueComparison at month end
 * - Reset to 0 for the new month
 */

/**
 * TESTING:
 * 
 * 1. Complete an order (set status to "delivered" or "paid")
 * 2. Check the vendor document in MongoDB:
 *    - currentMonthlyRevenue should increase
 *    - totalRevenue should increase
 *    - totalOrders should increment
 * 
 * 3. Wait for month end (or manually trigger):
 *    POST /api/vendors/record-monthly-revenue
 * 
 * 4. Check monthlyRevenueComparison array - should have current month's data
 */
