// admin.route.js
const express = require("express");
const router = express.Router();
const adminController = require("./admin.controller");
const { subscriptionController } = require("../subscription/subscription.controller.js");

// All admin routes protected & restricted to admin role
router.get("/", adminController.getDashboard);
router.put("/", adminController.updateDashboard);

// Subscription management for admins
router.get("/subscriptions", subscriptionController.getAllSubscriptions);
router.get("/subscriptions/:id", subscriptionController.getSubscriptionById);
router.put("/subscriptions/:id", subscriptionController.updateSubscription);
router.delete("/subscriptions/:id", subscriptionController.deleteSubscription);

// Plan management
router.get("/plans", subscriptionController.getAllPlans);
router.post("/plans", subscriptionController.createPlan);
router.put("/plans/:id", subscriptionController.updatePlan);
router.delete("/plans/:id", subscriptionController.deletePlan);

module.exports = router;
