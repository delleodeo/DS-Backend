// users.controller.js
const { createToken } = require("../../auth/token");
const userService = require("./users.service");

exports.register = async (req, res) => {
	try {
		const { name, email, password, phone, address = {}, otp } = req.body;

		const { user, token } = await userService.verifyAndRegister({
			name,
			email,
			password,
			address,
			phone,
			otp,
		});

		return res.status(201).json({
			message: "Registration complete!",
			user,
			token,
		});
	} catch (err) {
		console.error("[Verify & Register Error]", err);
		const status = err.status || 500;
		const message = err.message || "Registration failed";
		return res.status(status).json({ error: message });
	}
};

exports.login = async (req, res) => {
	try {
		const result = await userService.loginUser(req.body);

		// Set auth token as HTTP-only cookie
		// if(!result){
		// 	return res.status(401).json({message: "user not found!"});
		// }


		res.cookie("token", result.token, {
			httpOnly: true,
			secure: false, // Set to true if using HTTPS
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

		return res.json(result);
	} catch (err) {
		console.error("Login Error:", err);
		res.status(401).json({ error: err.message || "Login failed" });
	}
};

exports.getProfile = async (req, res) => {
	try {
		const user = await userService.getUserById(req.user.id);
		res.json(user);
	} catch (err) {
		console.error("Get Profile Error:", err);
		res.status(500).json({ error: err.message || "Failed to get profile" });
	}
};

exports.updateProfile = async (req, res) => {
	try {
		const updated = await userService.updateUser(req.user.id, req.body);
		res.json(updated);
	} catch (err) {
		console.error("Update Profile Error:", err);
		res.status(400).json({ error: err.message || "Profile update failed" });
	}
};

exports.deleteUser = async (req, res) => {
	try {
		await userService.deleteUser(req.user.id);
		res.json({ message: "User deleted" });
	} catch (err) {
		console.error("Delete User Error:", err);
		res.status(500).json({ error: err.message || "Failed to delete user" });
	}
};

exports.handleSocialLogin = (req, res) => {
	if (!req.user) {
		return res.status(401).json({ error: "Authentication failed" });
	}

	const token = createToken(req.user);

	res.cookie(
		"user",
		JSON.stringify({
			name: req.user.name,
			email: req.user.email,
			provider: req.user.provider,
			avatar: req.user.avatar,
			address: req.user.address,
			phone: req.user.phone,
		}),
		{
			httpOnly: false,
			secure: false,
			sameSite: "none",
			maxAge: 7 * 24 * 60 * 60 * 1000,
		}
	);

	res.cookie("token", token, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 7 * 24 * 60 * 60 * 1000,
	});

	return res.redirect(
		process.env.CLIENT_SUCCESS_URL || "https://darylbacongco.me/products"
	);
};

exports.getSession = async (req, res) => {
	const token = req.cookies?.token;
	const result = await userService.checkSession(token);

	if (!result.auth) {
		return res.status(401).json(result);
	}

	return res.json({ auth: true, token, user: result.decoded});
};

exports.logout = async (req, res) => {
	try {
		// Get token from Authorization header or cookies
		let token = req.token; // From protect middleware
		
		if (!token) {
			// Fallback to cookie token
			token = req.cookies?.token;
		}
		
		if (!token) {
			return res.status(400).json({ 
				error: "No token provided" 
			});
		}

		const userId = req.user?.id;
		
		// Call logout service
		const result = await userService.logoutUser(token, userId);
		
		// Clear HTTP-only cookie
		res.clearCookie("token", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
		});
		
		return res.json({
			success: true,
			message: "Logged out successfully"
		});
		
	} catch (error) {
		console.error("Logout controller error:", error);
		return res.status(error.status || 500).json({
			error: error.message || "Failed to logout"
		});
	}
};

exports.logoutCookie = async (req, res) => {
	try {
		const token = req.cookies?.token;
		
		if (!token) {
			// Even if no token, clear cookie and return success
			res.clearCookie("token", {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
			});
			
			return res.json({
				success: true,
				message: "Logged out successfully"
			});
		}

		// Decode token to get user ID
		const { verifyToken } = require("../../auth/token");
		let userId;
		try {
			const decoded = verifyToken(token);
			userId = decoded.id;
		} catch (err) {
			// Token invalid, just clear cookie
			console.log("Invalid token during logout, clearing cookie");
		}
		
		// Call logout service if we have a valid token
		if (userId) {
			await userService.logoutUser(token, userId);
		}
		
		// Clear HTTP-only cookie
		res.clearCookie("token", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
		});
		
		return res.json({
			success: true,
			message: "Logged out successfully"
		});
		
	} catch (error) {
		console.error("Cookie logout controller error:", error);
		
		// Always clear cookie even if error occurs
		res.clearCookie("token", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production", 
			sameSite: "lax",
		});
		
		return res.status(500).json({
			error: "Logout completed with errors"
		});
	}
};

// Admin function to check blacklist stats
exports.getBlacklistStats = async (req, res) => {
	try {
		const TokenBlacklist = require("../../auth/tokenBlacklist");
		const stats = await TokenBlacklist.getBlacklistStats();
		return res.json(stats);
	} catch (error) {
		console.error("Blacklist stats error:", error);
		return res.status(500).json({ error: "Failed to get blacklist stats" });
	}
};
