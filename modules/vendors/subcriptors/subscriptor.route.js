// routes/vendorAnalytics.routes.js
const router = require("express").Router();
const controller = require("./subscriptor.controller");
const { requireFeature } = require("../../../middleware/requireFeature");
const rateLimiter = require("../../../utils/rateLimiter");

router.use(rateLimiter({ windowSec: 1 * 60, maxRequests: 30, keyPrefix: "vendor-analytics" }));

router.get("/", requireFeature(), controller.getAnalyticsData);

module.exports = router;
