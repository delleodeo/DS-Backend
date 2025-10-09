// vendor.controller.js
const vendorService = require("./vendors.service");

exports.createVendor = async (req, res) => {
	try {
		const { id } = req.user;
		const vendor = await vendorService.createVendor({
			...req.body,
			userId: id,
		});
		res.status(201).json(vendor);
	} catch (err) {
		console.error("Create Vendor Error:", err);
		res.status(400).json({ error: err.message || "Failed to create vendor" });
	}
};

exports.getFeaturedVendor = async (req, res) => {
	try {
		const limit = parseInt(req.query.limit, 10) || 0;


		const vendors = await vendorService.getFeaturedVendor(limit);
		res.status(200).json(vendors);
	} catch (err) {
		console.error("Get Featured Vendor Error:", err);
		res.status(500).json({ error: err.message || "Failed to fetch featured vendors" });
	}
};

exports.getVendor = async (req, res) => {
	try {
		const vendor = await vendorService.getVendorById(req.user.id);
		console.log(req.user.id)
		res.json(vendor);
	} catch (err) {
		console.error("Get Vendor Error:", err);
		res.status(404).json({ error: err.message || "Vendor not found" });
	}
};

exports.followVendor = async (req, res) => {
	try {
		const userId = req.user.id; // from auth middleware
		const vendorId = req.params.vendorId;
		console.log(vendorId)
		const result = await vendorService.followVendor(vendorId, userId);
		res.status(200).json(result);
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
};


exports.getVendorDetails = async (req, res) => {
	const vendorId = req.params.vendorId;

	try {
		const vendor = await vendorService.getVendorDetails(vendorId);
		return res.status(200).json({
			success: true,
			data: vendor,
		});
	} catch (error) {
		console.error("[getVendorDetails]", error);
		return res.status(404).json({
			success: false,
			message: error.message || "Vendor not found",
		});
	}
};

exports.updateVendor = async (req, res) => {
	try {
		const updated = await vendorService.updateVendor(req.user.id, req.body);
		res.json(updated);
	} catch (err) {
		console.error("Update Vendor Error:", err);
		res.status(400).json({ error: err.message || "Failed to update vendor" });
	}
};

exports.deleteVendor = async (req, res) => {
	try {
		await vendorService.deleteVendor(req.user.id);
		res.json({ message: "Vendor deleted" });
	} catch (err) {
		console.error("Delete Vendor Error:", err);
		res.status(500).json({ error: err.message || "Failed to delete vendor" });
	}
};

exports.trackProfileView = async (req, res) => {
	try {
		const updated = await vendorService.incrementProfileViews(req.params.id);
		res.json({ message: "Profile view tracked", vendor: updated });
	} catch (err) {
		console.error("Track Profile View Error:", err);
		res
			.status(400)
			.json({ error: err.message || "Failed to track profile view" });
	}
};

exports.trackProductClick = async (req, res) => {
	try {
		const updated = await vendorService.incrementProductClicks(req.params.id);
		res.json({ message: "Product click tracked", vendor: updated });
	} catch (err) {
		console.error("Track Product Click Error:", err);
		res
			.status(400)
			.json({ error: err.message || "Failed to track product click" });
	}
};
