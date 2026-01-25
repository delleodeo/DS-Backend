const express = require("express");
const router = express.Router();
const { subscriptionController } = require("./subscription.controller.js");
const {requireFeature} = require("../../middleware/requireFeature");

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.get("/", requireFeature(), asyncHandler(subscriptionController.getMySubscription));

router.post(
  "/start-or-change",
  asyncHandler(subscriptionController.startOrChangePlan),
);

// router.post("/renew", requireFeature(), asyncHandler(subscriptionController.renew));

// router.post("/cancel", requireFeature(), asyncHandler(subscriptionController.cancelAtPeriodEnd));

// Public route for plans (no auth required)
router.get("/plans", asyncHandler(subscriptionController.getAllPlans));

module.exports = router;
