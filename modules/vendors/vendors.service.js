// vendor.service.js
const Vendor = require("./vendors.model");
const Order = require("../orders/orders.model");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");

const redisClient = getRedisClient();

const getVendorCacheKey = (vendorId) => `vendor:${vendorId}`;
const getVendorDetailsKey = (vendorId) => `vendor:details:${vendorId}`;
const COMMISSION_RATE = 0.07; // 7% platform commission

exports.createVendor = async (vendorData, vendorId) => {
	const isExist = await Vendor.findOne({ userId: vendorId });
	console.log(isExist);

	if (isExist) return { message: "You already created your shop!" };
	const vendor = new Vendor(vendorData);
	const saved = await vendor.save();
	if (isRedisAvailable()) {
		await redisClient.set(
			getVendorCacheKey(saved.userId),
			JSON.stringify(saved),
			{ EX: 300 }
		);
	}
	return saved;
};

exports.followVendor = async (vendorId, userId) => {
	try {
		if (isRedisAvailable()) {
			const { safeDel } = require('../../config/redis');
			await safeDel(`vendor:details:${vendorId}`);
		}

		// Support both vendor _id and vendor.userId in the route param
		let vendor = await Vendor.findById(vendorId);
		if (!vendor) {
			vendor = await Vendor.findOne({ userId: vendorId });
		}

		if (!vendor) {
 			throw new Error("Vendor not found");
		}

		// Prevent users from following themselves
		if (String(vendor.userId) === String(userId)) {
			throw new Error("You cannot follow your own shop");
		}

		// Convert userId to string for consistent comparison
		const userIdStr = String(userId);

		const isFollowing = vendor.followers.map(String).includes(userIdStr);

		if (isFollowing) {
			// Unfollow logic: remove userId from array
			vendor.followers = vendor.followers.filter(
				(id) => String(id) !== userIdStr
			);

			await vendor.save();

			return {
				message: "Unfollowed successfully",
				totalFollowers: vendor.followers.length,
			};
		}

		// Follow logic: add userId
		vendor.followers.push(userIdStr);
		await vendor.save();

		return {
			message: "Followed successfully",
			totalFollowers: vendor.followers.length,
		};
	} catch (error) {
		console.error("Follow Vendor Error:", error);
		throw new Error("Failed to follow/unfollow vendor");
	}
};

exports.getFeaturedVendor = async () => {
	try {
		const featuredVendorKey = "vendor:featured"; // ✅ static or generated cache key
		if (isRedisAvailable()) {
			const cached = await redisClient.get(featuredVendorKey);
			if (cached) return JSON.parse(cached);
		}

		const featuredVendor = await Vendor.find()
			.select("storeName userId imageUrl")
			.lean(); // 🧠 use lean() for better perf
		const paginated = featuredVendor.slice(0, 10);

		// ✅ Properly return object in map
		const filteredData = paginated.map((data) => ({
			storeName: data.storeName,
			userId: data.userId,
			imageUrl: data.imageUrl,
		}));

		// ✅ Cache only if data exists
		if (filteredData.length > 0 && isRedisAvailable()) {
			await redisClient.set(featuredVendorKey, JSON.stringify(filteredData), {
				EX: 300, // 5 minutes
			});
		}

		return filteredData;
	} catch (error) {
		console.error("Get Featured Vendor Error:", error);
		// Fallback to DB if Redis fails
		const featuredVendor = await Vendor.find()
			.select("storeName userId imageUrl")
			.lean();
		const paginated = featuredVendor.slice(0, 10);
		return paginated.map((data) => ({
			storeName: data.storeName,
			userId: data.userId,
			imageUrl: data.imageUrl,
		}));
	}
};

exports.getVendorDetails = async (vendorId) => {
	try {
		if (isRedisAvailable()) {
			const cached = await redisClient.get(getVendorDetailsKey(vendorId));
			if (cached) return JSON.parse(cached);
		}

		const vendor = await Vendor.findOne({ userId: vendorId })
			.select(
				"address storeName followers rating numRatings userId totalProducts totalOrders totalRevenue imageUrl description phoneNumber createdAt"
			)
			.populate("followers", "name email _id");

		if (!vendor) {
			throw new Error("Vendor not found");
		}

		// Get count of approved products only
		const Product = require('../products/products.model');
		const approvedProductCount = await Product.countDocuments({
			vendor: vendorId,
			status: 'approved',
			isDisabled: { $ne: true }
		});

		// Get total completed orders (actual sales count)
		const Order = require('../orders/orders.model');
		const completedOrders = await Order.countDocuments({
			vendor: vendorId,
			status: { $in: ['completed', 'delivered'] }
		});

		// Get total reviews for this vendor's products
		const Review = require('../reviews/review.model');
		const totalReviews = await Review.countDocuments({
			vendor: vendorId
		});

		// Build enriched vendor data
		const vendorData = vendor.toObject();
		vendorData.approvedProducts = approvedProductCount;
		vendorData.totalSales = completedOrders;
		vendorData.totalReviews = totalReviews;
		vendorData.responseRate = 95; // Default, can be calculated from message data
		vendorData.responseTime = 'Within 1 hour'; // Default, can be calculated
		vendorData.isVerified = vendor.isApproved !== false;

		if (isRedisAvailable()) {
			await redisClient.set(
				getVendorDetailsKey(vendorId),
				JSON.stringify(vendorData),
				{ EX: 300 }
			);
		}

		return vendorData;
	} catch (error) {
		console.error('getVendorDetails error:', error);
		const vendor = await Vendor.findOne({ userId: vendorId })
			.select(
				"address storeName followers rating numRatings userId totalProducts totalOrders totalRevenue imageUrl description phoneNumber createdAt"
			)
			.populate("followers", "name email _id");
		return vendor;
	}
};

exports.getVendorById = async (id) => {
	const cacheKey = getVendorCacheKey(id);
	if (isRedisAvailable()) {
		const cached = await redisClient.get(cacheKey);
		if (cached) return JSON.parse(cached);
	}

	const vendor = await Vendor.findOne({ userId: id }).populate(
		"followers",
		"name email"
	);
	if (!vendor) throw new Error("Vendor not found");

	// Calculate stats on-demand from orders in database
	const calculatedStats = await exports.calculateVendorStats(id);
	const vendorData = vendor.toObject();
	vendorData.totalOrders = calculatedStats.totalOrders;
	vendorData.totalRevenue = calculatedStats.totalRevenue;
	vendorData.currentMonthlyRevenue = calculatedStats.currentMonthlyRevenue;
	vendorData.monthlyRevenueComparison = calculatedStats.monthlyRevenueComparison;

	if (isRedisAvailable()) {
		await redisClient.set(cacheKey, JSON.stringify(vendorData), { EX: 300 });
	}
	return vendorData;
};

/**
 * Calculate vendor stats on-demand from orders in database
 * This ensures data accuracy by not relying on incremental updates
 * @param {String} vendorId - The vendor's user ID
 * @returns {Object} Calculated stats from orders
 */
exports.calculateVendorStats = async (vendorId) => {
	try {
		const MONTH_NAMES = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];

		// Get all delivered/completed orders for this vendor
		const orders = await Order.find({
			vendorId: vendorId,
			status: { $in: ['delivered', 'completed'] }
		}).select('subTotal createdAt').lean();

		const monthlyMap = new Map();
		let totalRevenue = 0;

		for (const order of orders) {
			const gross = order.subTotal || 0;
			totalRevenue += gross;
			const d = new Date(order.createdAt);
			const year = d.getFullYear();
			const monthName = MONTH_NAMES[d.getMonth()];
			const key = `${year}:${monthName}`;
			if (!monthlyMap.has(key)) {
				monthlyMap.set(key, { year, monthName, total: 0 });
			}
			monthlyMap.get(key).total += gross;
		}

		// Build monthlyRevenueComparison
		const groupedByYear = {};
		for (const { year, monthName, total } of monthlyMap.values()) {
			if (!groupedByYear[year]) {
				groupedByYear[year] = {
					year,
					revenues: {
						January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
						July: 0, August: 0, September: 0, October: 0, November: 0, December: 0
					}
				};
			}
			groupedByYear[year].revenues[monthName] += total;
		}

		const monthlyRevenueComparison = Object.values(groupedByYear);

		const now = new Date();
		const currentMonthName = MONTH_NAMES[now.getMonth()];
		const currentYear = now.getFullYear();
		const currentMonthRevenue = monthlyRevenueComparison
			.find((c) => c.year === currentYear)?.revenues[currentMonthName] || 0;

		return {
			totalOrders: orders.length,
			totalRevenue: parseFloat(totalRevenue.toFixed(2)),
			currentMonthlyRevenue: parseFloat(currentMonthRevenue.toFixed(2)),
			monthlyRevenueComparison
		};
	} catch (error) {
		console.error("Calculate Vendor Stats Error:", error);
		return {
			totalOrders: 0,
			totalRevenue: 0,
			currentMonthlyRevenue: 0,
			monthlyRevenueComparison: []
		};
	}
};

exports.updateVendor = async (id, updates) => {
	const updated = await Vendor.findOneAndUpdate({ userId: id }, updates, {
		new: true,
		runValidators: true,
	});
	if (!updated) throw new Error("Vendor not found or update failed");

	if (isRedisAvailable()) {
		await redisClient.set(getVendorCacheKey(id), JSON.stringify(updated), {
			EX: 3600,
		});
	}
	return updated;
};

exports.deleteVendor = async (id) => {
	const deleted = await Vendor.findByIdAndDelete(id);
	if (!deleted) throw new Error("Vendor not found or already deleted");

	if (isRedisAvailable()) {
		const { safeDel } = require('../../config/redis');
		await safeDel(getVendorCacheKey(id));
	}
};

exports.incrementProfileViews = async (userId) => {
	const vendor = await Vendor.findOneAndUpdate(
		{ userId },
		{ $inc: { profileViews: 1 } },
		{ new: true }
	);
	if (vendor && isRedisAvailable())
		await redisClient.set(getVendorCacheKey(userId), JSON.stringify(vendor), {
			EX: 3600,
		});
};

exports.incrementProductClicks = async (userId) => {
	const vendor = await Vendor.findOneAndUpdate(
		{ userId },
		{ $inc: { productClicks: 1 } },
		{ new: true }
	);
	if (vendor && isRedisAvailable())
		await redisClient.set(getVendorCacheKey(userId), JSON.stringify(vendor), {
			EX: 3600,
		});
};

/**
 * Push monthly revenue to monthlyRevenueComparison at the end of each month
 * @param {String} userId - The vendor's user ID
 * @param {Number} revenueAmount - The total revenue for the month
 * @param {Number} year - The year (optional, defaults to current year)
 * @param {String} month - The month name (optional, defaults to current month)
 * @returns {Object} Updated vendor document
 */
exports.pushMonthlyRevenue = async (
	userId,
	revenueAmount,
	year = null,
	month = null
) => {
	try {
		const currentDate = new Date();
		const targetYear = year || currentDate.getFullYear();
		const monthNames = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		];
		const targetMonth = month || monthNames[currentDate.getMonth()];

		// Find the vendor
		const vendor = await Vendor.findOne({ userId });
		if (!vendor) {
			throw new Error("Vendor not found");
		}

		// Find if the year already exists in monthlyRevenueComparison
		const yearIndex = vendor.monthlyRevenueComparison.findIndex(
			(data) => data.year === targetYear
		);

		if (yearIndex !== -1) {
			// Year exists, update the specific month
			vendor.monthlyRevenueComparison[yearIndex].revenues[targetMonth] = revenueAmount;
		} else {
			// Year doesn't exist, create new year entry
			const newYearData = {
				year: targetYear,
				revenues: {
					January: 0,
					February: 0,
					March: 0,
					April: 0,
					May: 0,
					June: 0,
					July: 0,
					August: 0,
					September: 0,
					October: 0,
					November: 0,
					December: 0,
					[targetMonth]: revenueAmount
				}
			};
			vendor.monthlyRevenueComparison.push(newYearData);
		}

		// Save the updated vendor
		await vendor.save();

		// Clear cache
		const { safeDel } = require('../../config/redis');
		await safeDel(getVendorCacheKey(userId));

		return {
			success: true,
			message: `Revenue for ${targetMonth} ${targetYear} updated successfully`,
			data: vendor.monthlyRevenueComparison
		};
	} catch (error) {
		console.error("Push Monthly Revenue Error:", error);
		throw error;
	}
};

/**
 * Reset current month's revenue (use at start of new month if needed)
 * Note: Revenue is now pushed to monthlyRevenueComparison immediately on each sale
 * @param {String} userId - The vendor's user ID
 * @returns {Object} Updated vendor document
 */
exports.resetCurrentMonthRevenue = async (userId) => {
	try {
		const vendor = await Vendor.findOne({ userId });
		if (!vendor) {
			throw new Error("Vendor not found");
		}

		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const currentMonth = monthNames[currentDate.getMonth()];

		// Reset currentMonthlyRevenue to 0 for the new month
		vendor.currentMonthlyRevenue = 0;
		await vendor.save();

		// Clear cache
		const { safeDel } = require('../../config/redis');
		await safeDel(getVendorCacheKey(userId));

		return {
			success: true,
			message: `Current monthly revenue reset for ${currentMonth} ${currentYear}`,
			data: vendor.monthlyRevenueComparison
		};
	} catch (error) {
		console.error("Reset Current Month Revenue Error:", error);
		throw error;
	}
};

/**
 * Batch reset all vendors' currentMonthlyRevenue at month start
 * Optional: Use this with a cron job at the start of each month
 * @returns {Object} Summary of processed vendors
 */
exports.batchResetMonthlyRevenue = async () => {
	try {
		const vendors = await Vendor.find({});
		const results = {
			success: [],
			failed: []
		};

		for (const vendor of vendors) {
			try {
				await exports.resetCurrentMonthRevenue(vendor.userId);
				results.success.push(vendor.userId);
			} catch (error) {
				console.error(`Failed to reset revenue for vendor ${vendor.userId}:`, error);
				results.failed.push({
					userId: vendor.userId,
					error: error.message
				});
			}
		}

		return {
			success: true,
			message: "Batch monthly revenue reset completed",
			totalVendors: vendors.length,
			successCount: results.success.length,
			failedCount: results.failed.length,
			details: results
		};
	} catch (error) {
		console.error("Batch Reset Monthly Revenue Error:", error);
		throw error;
	}
};

/**
 * Get vendor financial summary with commission breakdown
 * @param {String} vendorId - The vendor's user ID
 * @returns {Object} Financial summary with earnings, commissions, and order breakdown
 */
exports.getVendorFinancials = async (vendorId) => {
	try {
		const vendor = (await Vendor.findOne({ userId: vendorId })) || (await Vendor.findById(vendorId));
		const effectiveCommissionRate = vendor?.commissionRate ?? COMMISSION_RATE;
		// Get all orders for this vendor that are delivered
		const orders = await Order.find({
			vendorId: vendorId,
			status: { $in: ['delivered', 'completed'] }
		}).sort({ createdAt: -1 }).lean();

		// Calculate totals
		let totalGrossRevenue = 0;
		let totalCommissionPaid = 0;
		let totalCommissionPending = 0;
		let totalNetEarnings = 0;
		let codPendingCommission = 0;
		let digitalPaymentCommission = 0;
		let pendingAdminRelease = 0;
		let netReleased = 0;
		let netExpected = 0;

		const orderHistory = [];

		for (const order of orders) {
			const grossAmount = order.subTotal || 0;
			const orderCommissionRate = order.commissionRate ?? effectiveCommissionRate;
			const commissionAmount = order.commissionAmount || parseFloat((grossAmount * orderCommissionRate).toFixed(2));
			const netEarnings = order.sellerEarnings || parseFloat((grossAmount - commissionAmount).toFixed(2));
			const payoutStatus = order.payoutStatus || 'not_applicable';
			const escrowStatus = order.escrowStatus || 'not_applicable';
			const isCod = String(order.paymentMethod || 'cod').toLowerCase() === 'cod';

			totalGrossRevenue += grossAmount;
			netExpected += netEarnings;

			// Check commission status
			const commissionStatus = order.commissionStatus || 'pending';
			const paymentMethod = order.paymentMethod || 'COD';

			if (commissionStatus === 'paid' || commissionStatus === 'waived') {
				totalCommissionPaid += commissionAmount;
				totalNetEarnings += netEarnings;
				
				if (paymentMethod !== 'COD') {
					digitalPaymentCommission += commissionAmount;
				}
			} else {
				// For COD pending collection
				totalCommissionPending += commissionAmount;
				totalNetEarnings += netEarnings;
				
				if (paymentMethod === 'COD') {
					codPendingCommission += commissionAmount;
				}
			}

			if (!isCod) {
				if (payoutStatus === 'released' || escrowStatus === 'released') {
					netReleased += netEarnings;
				} else {
					pendingAdminRelease += netEarnings;
				}
			} else {
				if (commissionStatus === 'pending') {
					// vendor still holds full cash but owes commission
				} else {
					netReleased += netEarnings;
				}
			}

			orderHistory.push({
				orderId: order._id,
				orderNumber: order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
				date: order.createdAt,
				status: order.status,
				paymentMethod: paymentMethod,
				paymentStatus: order.paymentStatus || 'pending',
				grossAmount: grossAmount,
				commissionAmount: commissionAmount,
				commissionStatus: commissionStatus,
				netEarnings: netEarnings,
				payoutStatus: payoutStatus,
				buyerName: order.shippingAddress?.fullName || 'N/A'
			});
		}

		// Get monthly breakdown for current year
		const currentYear = new Date().getFullYear();
		const monthlyBreakdown = {};
		const months = ['January', 'February', 'March', 'April', 'May', 'June',
						'July', 'August', 'September', 'October', 'November', 'December'];
		
		months.forEach(month => {
			monthlyBreakdown[month] = {
				grossRevenue: 0,
				commissionPaid: 0,
				commissionPending: 0,
				netEarnings: 0,
				orderCount: 0
			};
		});

		orders.forEach(order => {
			const orderDate = new Date(order.createdAt);
			if (orderDate.getFullYear() === currentYear) {
				const monthName = months[orderDate.getMonth()];
				const grossAmount = order.subTotal || 0;
				const orderCommissionRate = order.commissionRate ?? effectiveCommissionRate;
				const commissionAmount = order.commissionAmount || parseFloat((grossAmount * orderCommissionRate).toFixed(2));
				const commissionStatus = order.commissionStatus || 'pending';

				monthlyBreakdown[monthName].grossRevenue += grossAmount;
				monthlyBreakdown[monthName].orderCount += 1;

				if (commissionStatus === 'paid' || commissionStatus === 'waived') {
					monthlyBreakdown[monthName].commissionPaid += commissionAmount;
					monthlyBreakdown[monthName].netEarnings += (grossAmount - commissionAmount);
				} else {
					monthlyBreakdown[monthName].commissionPending += commissionAmount;
					monthlyBreakdown[monthName].netEarnings += (grossAmount - commissionAmount);
				}
			}
		});

		return {
			success: true,
			summary: {
				totalGrossRevenue: parseFloat(totalGrossRevenue.toFixed(2)),
				totalCommissionPaid: parseFloat(totalCommissionPaid.toFixed(2)),
				totalCommissionPending: parseFloat(totalCommissionPending.toFixed(2)),
				totalNetEarnings: parseFloat(totalNetEarnings.toFixed(2)),
				netEarningsReleased: parseFloat(netReleased.toFixed(2)),
				pendingAdminRelease: parseFloat(pendingAdminRelease.toFixed(2)),
				netEarningsExpected: parseFloat(netExpected.toFixed(2)),
				codPendingCommission: parseFloat(codPendingCommission.toFixed(2)),
				digitalPaymentCommission: parseFloat(digitalPaymentCommission.toFixed(2)),
				commissionRate: (effectiveCommissionRate || COMMISSION_RATE) * 100,
				totalOrders: orders.length
			},
			monthlyBreakdown,
			recentOrders: orderHistory.slice(0, 20) // Last 20 orders
		};
	} catch (error) {
		console.error("Get Vendor Financials Error:", error);
		throw error;
	}
};

/**
 * Get vendor pending COD commission details
 * Shows orders where vendor needs to remit commission
 * @param {String} vendorId - The vendor's user ID
 * @returns {Object} List of pending COD commissions
 */
exports.getVendorPendingCODCommissions = async (vendorId) => {
	try {
		const orders = await Order.find({
			vendorId: vendorId,
			paymentMethod: 'COD',
			status: { $in: ['delivered', 'completed'] },
			commissionStatus: { $in: ['pending', null] }
		}).sort({ createdAt: -1 }).lean();

		const pendingCommissions = orders.map(order => {
			const grossAmount = order.subTotal || 0;
			const commissionAmount = order.commissionAmount || parseFloat((grossAmount * COMMISSION_RATE).toFixed(2));

			return {
				orderId: order._id,
				orderNumber: order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
				deliveredDate: order.deliveredAt || order.updatedAt,
				grossAmount: grossAmount,
				commissionDue: commissionAmount,
				buyerName: order.shippingAddress?.fullName || 'N/A',
				buyerPhone: order.shippingAddress?.phone || 'N/A'
			};
		});

		const totalPending = pendingCommissions.reduce((sum, o) => sum + o.commissionDue, 0);

		return {
			success: true,
			totalPendingCommission: parseFloat(totalPending.toFixed(2)),
			pendingOrdersCount: pendingCommissions.length,
			orders: pendingCommissions
		};
	} catch (error) {
		console.error("Get Vendor Pending COD Commissions Error:", error);
		throw error;
	}
};
