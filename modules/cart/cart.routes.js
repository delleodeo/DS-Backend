const express = require("express");
const router = express.Router();
const cartController = require("./cart.controller");
const { protect } = require("../../auth/auth.controller.js");

router.get("/", cartController.getCart);
router.post("/add", cartController.addToCart);
router.put("/update", cartController.updateCartItem);
router.delete("/remove", cartController.removeCartItem);
router.delete("/clear", cartController.clearCart);

module.exports = router;
