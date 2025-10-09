// admin.service.js
const Admin = require("./admin.model");
const redisClient = require("../../config/redis");

const ADMIN_CACHE_KEY = "admin:dashboard";

exports.getDashboardData = async () => {
  const cached = await redisClient.get(ADMIN_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  let adminData = await Admin.findOne();
  if (!adminData) {
    adminData = await new Admin().save();
  }

  await redisClient.set(ADMIN_CACHE_KEY, JSON.stringify(adminData), { EX: 600 });
  return adminData;
};

exports.updateDashboardData = async (updates) => {
  const updated = await Admin.findOneAndUpdate({}, updates, {
    new: true,
    upsert: true,
    runValidators: true,
  });

  if (!updated) throw new Error("Failed to update admin dashboard");

  await redisClient.set(ADMIN_CACHE_KEY, JSON.stringify(updated), { EX: 600 });
  return updated;
};
