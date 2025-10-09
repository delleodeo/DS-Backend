// admin.route.js
const express = require("express");
const router = express.Router();
const adminController = require("./admin.controller");

// All admin routes protected & restricted to admin role
router.get("/", adminController.getDashboard);
router.put("/", adminController.updateDashboard);

module.exports = router;
