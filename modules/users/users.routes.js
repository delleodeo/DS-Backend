const express = require("express");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const passport = require("passport");
const router = express.Router();
const userController = require("./users.controller");
const { protect } = require("../../auth/auth.controller.js");
const { requestRegistrationOtp } = require("../../utils/otp.controller.js");

// register & login
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/logout", protect, userController.logout);
router.post("/logout-cookie", userController.logoutCookie); // For cookie-based logout
router.post("/request-otp", requestRegistrationOtp);

// continue wihh google or facebook
router.get(
	"/google",
	passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
	"/google/callback",
	passport.authenticate("google", { failureRedirect: "/", session: true }),
	async (req, res, next) => {
		try {
			console.log("Google callback: req.user =", req.user);
			await userController.handleSocialLogin(req, res);
		} catch (err) {
			console.error("❌ Error in Google callback:", err);
			next(err);
		}
	}
);

router.get(
	"/facebook",
	passport.authenticate("facebook", { scope: ["email"] })
);
router.get(
	"/facebook/callback",
	passport.authenticate("facebook", { failureRedirect: "/", session: true }),
	async (req, res, next) => {
		try {
			console.log("✅ Facebook callback: req.user =", req.user);
			await userController.handleSocialLogin(req, res);
		} catch (err) {
			console.error("❌ Error in Facebook callback:", err);
			next(err);
		}
	}
);

// get, update, delete account
router.get("/me", protect, userController.getProfile);
router.put("/me", protect, userController.updateProfile);
router.delete("/me", protect, userController.deleteUser);

router.get("/session", userController.getSession);

// Admin routes (add proper admin middleware if needed)
router.get("/blacklist-stats", protect, userController.getBlacklistStats);

module.exports = router;
