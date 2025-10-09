// admin.controller.js
const adminService = require("./admin.service");

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await adminService.getDashboardData();
    res.json(dashboard);
  } catch (err) {
    console.error("Get Dashboard Error:", err);
    res.status(500).json({ error: err.message || "Failed to get admin dashboard" });
  }
};

exports.updateDashboard = async (req, res) => {
  try {
    const updated = await adminService.updateDashboardData(req.body);
    res.json(updated);
  } catch (err) {
    console.error("Update Dashboard Error:", err);
    res.status(400).json({ error: err.message || "Failed to update admin dashboard" });
  }
};
