// admin.service.js
const Admin = require("./admin.model");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");
const redisClient = getRedisClient();

const ADMIN_CACHE_KEY = "admin:dashboard";

exports.getDashboardData = async () => {
	if (isRedisAvailable()) {
		const cached = await redisClient.get(ADMIN_CACHE_KEY).catch(() => null);
		if (cached) return JSON.parse(cached);
	}

	let adminData = await Admin.findOne();
	if (!adminData) {
		adminData = await new Admin().save();
	}

	if (isRedisAvailable()) {
		await redisClient.set(ADMIN_CACHE_KEY, JSON.stringify(adminData), { EX: 600 }).catch(() => {});
	}
	return adminData;
};

exports.updateDashboardData = async (updates) => {
  const updated = await Admin.findOneAndUpdate({}, updates, {
    new: true,
    upsert: true,
    runValidators: true,
  });

  if (!updated) throw new Error("Failed to update admin dashboard");

	if (isRedisAvailable()) {
		await redisClient.set(ADMIN_CACHE_KEY, JSON.stringify(updated), { EX: 600 }).catch(() => {});
	}
	return updated;
};
