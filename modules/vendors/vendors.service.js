// vendor.service.js
const Vendor = require("./vendors.model");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");

const redisClient = getRedisClient();

const getVendorCacheKey = (vendorId) => `vendor:${vendorId}`;
const getVendorDetailsKey = (vendorId) => `vendor:details:${vendorId}`;

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
			await redisClient.del(`vendor:details:${vendorId}`);
		}

		const vendor = await Vendor.findOne({ userId: vendorId });

		if (!vendor) {
			throw new Error("Vendor not found");
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
				"address storeName followers rating numRatings userId totalProducts imageUrl"
			)
			.populate("followers", "name email"); // Populate followers if you want details, or remove this if just IDs

		if (isRedisAvailable()) {
			await redisClient.set(
				getVendorDetailsKey(vendorId),
				JSON.stringify(vendor),
				{ EX: 300 }
			);
		}

		if (!vendor) {
			throw new Error("Vendor not found");
		}

		return vendor;
	} catch (error) {
		const vendor = await Vendor.findOne({ userId: vendorId })
			.select(
				"address storeName followers rating numRatings userId totalProducts imageUrl"
			)
			.populate("followers", "name email");
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

	if (isRedisAvailable()) {
		await redisClient.set(cacheKey, JSON.stringify(vendor), { EX: 300 });
	}
	return vendor;
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
		await redisClient.del(getVendorCacheKey(id));
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
		await redisClient.del(getVendorCacheKey(userId));

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
		await redisClient.del(getVendorCacheKey(userId));

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
