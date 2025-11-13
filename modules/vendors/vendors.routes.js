// vendor.route.js
const express = require("express");
const router = express.Router();
const vendorController = require("./vendors.controller");
const { protect, restrictTo } = require("../../auth/auth.controller");

router.post(
	"/",
	protect,
	restrictTo("user", "admin"),
	vendorController.createVendor
);
router.post("/follow/:vendorId", protect, vendorController.followVendor);
router.get("/", protect, vendorController.getVendor);
router.get("/featured", vendorController.getFeaturedVendor);
router.put(
	"/",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.updateVendor
);
router.delete("/", protect, restrictTo("admin"), vendorController.deleteVendor);
router.get("/:vendorId/details", vendorController.getVendorDetails);

// Analytics routes
router.post("/profile-view/:id", vendorController.trackProfileView);
router.post("/product-click/:id", vendorController.trackProductClick);

// Monthly revenue routes
router.post(
	"/reset-monthly-revenue",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.resetMonthlyRevenue
);
router.post(
	"/batch-reset-monthly-revenue",
	protect,
	restrictTo("admin"),
	vendorController.batchResetMonthlyRevenue
);

module.exports = router;
