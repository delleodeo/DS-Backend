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
