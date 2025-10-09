// vendor.service.js
const Vendor = require("./vendors.model");
const redisClient = require("../../config/redis");

const getVendorCacheKey = (vendorId) => `vendor:${vendorId}`;
const getVendorDetailsKey = (vendorId) => `vendor:details:${vendorId}`;

exports.createVendor = async (vendorData, vendorId) => {
	const isExist = await Vendor.findOne({ userId: vendorId });
	console.log(isExist);

	if (isExist) return { message: "You already created your shop!" };
	const vendor = new Vendor(vendorData);
	const saved = await vendor.save();
	await redisClient.set(
		getVendorCacheKey(saved.userId),
		JSON.stringify(saved),
		{ EX: 300 }
	);
	return saved;
};

exports.followVendor = async (vendorId, userId) => {
	try {
		await redisClient.del(`vendor:details:${vendorId}`);

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
		const cached = await redisClient.get(featuredVendorKey);

		if (cached) return JSON.parse(cached);

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
		if (filteredData.length > 0) {
			await redisClient.set(featuredVendorKey, JSON.stringify(filteredData), {
				EX: 300, // 5 minutes
			});
		}

		return filteredData;
	} catch (error) {
		console.error("Get Featured Vendor Error:", error);
		return [];
	}
};

exports.getVendorDetails = async (vendorId) => {
	try {
		const cached = await redisClient.get(getVendorDetailsKey(vendorId));

		if (cached) return JSON.parse(cached);

		const vendor = await Vendor.findOne({ userId: vendorId })
			.select(
				"address storeName followers rating numRatings userId totalProducts imageUrl"
			)
			.populate("followers", "name email"); // Populate followers if you want details, or remove this if just IDs

		await redisClient.set(
			getVendorDetailsKey(vendorId),
			JSON.stringify(vendor),
			{ EX: 300 }
		);

		if (!vendor) {
			throw new Error("Vendor not found");
		}

		return vendor;
	} catch (error) {
		throw error;
	}
};

exports.getVendorById = async (id) => {
	const cacheKey = getVendorCacheKey(id);
	const cached = await redisClient.get(cacheKey);
	if (cached) return JSON.parse(cached);

	const vendor = await Vendor.findOne({userId: id}).populate("followers", "name email"); ;
	if (!vendor) throw new Error("Vendor not found");

	await redisClient.set(cacheKey, JSON.stringify(vendor), { EX: 300 });
	return vendor;
};

exports.updateVendor = async (id, updates) => {
	const updated = await Vendor.findOneAndUpdate({ userId: id }, updates, {
		new: true,
		runValidators: true,
	});
	if (!updated) throw new Error("Vendor not found or update failed");

	await redisClient.set(getVendorCacheKey(id), JSON.stringify(updated), {
		EX: 3600,
	});
	return updated;
};

exports.deleteVendor = async (id) => {
	const deleted = await Vendor.findByIdAndDelete(id);
	if (!deleted) throw new Error("Vendor not found or already deleted");

	await redisClient.del(getVendorCacheKey(id));
};

exports.incrementProfileViews = async (userId) => {
	const vendor = await Vendor.findOneAndUpdate(
		{ userId },
		{ $inc: { profileViews: 1 } },
		{ new: true }
	);
	if (vendor)
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
	if (vendor)
		await redisClient.set(getVendorCacheKey(userId), JSON.stringify(vendor), {
			EX: 3600,
		});
};
