const express = require("express");
const router = express.Router();
const { subscriptionController } = require("./subscription.controller.js");

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.get("/", asyncHandler(subscriptionController.getMySubscription));

router.post(
  "/start-or-change",
  asyncHandler(subscriptionController.startOrChangePlan),
);

router.post("/renew", asyncHandler(subscriptionController.renew));

router.post("/cancel", asyncHandler(subscriptionController.cancelAtPeriodEnd));

module.exports = router;
