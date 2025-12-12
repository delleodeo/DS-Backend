const bcrypt = require("bcryptjs");
const User = require("./users.model");
const Admin = require("../admin/admin.model.js");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");
const redisClient = getRedisClient();
const { createToken, verifyToken } = require("../../auth/token.js");

const getUserCacheKey = (id) => `user:profile:${id}`;
const userRedisOtpKey = (email) => `opt:${email}`;

exports.verifyAndRegister = async ({
	name,
	email,
	password,
	phone,
	address,
	otp,
}) => {
	const existing = await User.findOne({ email });
	if (existing) throw { status: 400, message: "Email already registered" };
	console.log(email);
	
	if (!isRedisAvailable()) {
		throw { status: 503, message: "OTP service temporarily unavailable" };
	}
	
	const registration = await redisClient.get(userRedisOtpKey(email)).catch(() => null);
	if (!registration) {
		throw { status: 400, message: "No OTP request found for this email" };
	}
	
	const parseOtpData = JSON.parse(registration);

	if (parseOtpData.otp !== otp || parseOtpData.otpExpiry < Date.now()) {
		throw { status: 400, message: "Invalid or expired OTP" };
	}

	const hashed = await bcrypt.hash(password, 12);

	const user = await User.create({
		name,
		email,
		password: hashed,
		phone,
		address,
		isVerified: true,
	});

	await Admin.updateOne({}, { $inc: { totalUsers: 1, newUsersCount: 1 } });

	if (isRedisAvailable()) {
		await redisClient.del(userRedisOtpKey(email)).catch(() => {});
	}

	const token = createToken(user);

	return { user, token };
};

exports.loginUser = async ({ email, password }) => {
	const user = await User.findOne({ email });
	if (!user) throw new Error("User Not Found!");

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) throw new Error("Wrong password");

	const token = createToken(user);
	const { password: _, ...userData } = user.toObject();
	return { user: userData, token };
};

exports.getUserById = async (id) => {
	const cacheKey = getUserCacheKey(id);
	
	if (isRedisAvailable()) {
		const cached = await redisClient.get(cacheKey).catch(() => null);
		if (cached) return JSON.parse(cached);
	}

	const user = await User.findById(id).select("-password");
	if (!user) throw new Error("User not found");

	if (isRedisAvailable()) {
		await redisClient.set(cacheKey, JSON.stringify(user), { EX: 600 }).catch(() => {});
	}
	return user;
};

exports.updateUser = async (id, updates) => {
	const updated = await User.findByIdAndUpdate(id, updates, {
		new: true,
		runValidators: true,
	}).select("-password");

	if (!updated) throw new Error("Failed to update user");

	const cacheKey = getUserCacheKey(id);
	if (isRedisAvailable()) {
		await redisClient.set(cacheKey, JSON.stringify(updated), { EX: 3600 }).catch(() => {});
	}

	return updated;
};

exports.deleteUser = async (id) => {
	const deleted = await User.findByIdAndDelete(id);
	if (!deleted) throw new Error("User not found or already deleted");
	await Admin.updateOne(
		{},
		{
			$inc: {
				totalUsers: -1,
			},
		}
	);
	if (isRedisAvailable()) {
		await redisClient.del(getUserCacheKey(id)).catch(() => {});
	}
};

// continue by email or facebook
exports.findOrCreateSocialUser = async (profile, provider) => {
	const providerId = profile.id;
	const email =
		profile.emails?.[0]?.value || `${provider}_${providerId}@example.com`;

	const user = await User.findOne({ email });
	if (user) return user;

	// Create new user
	const newUser = await User.create({
		name: profile.displayName,
		email,
		provider,
		providerId,
		isVerified: true,
		address: {},
	});

	return newUser;
};

exports.checkSession = async (token) => {
  try {
    if (!token) {
      return { auth: false, reason: "no-cookie" };
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return { auth: false, reason: "invalid-token" };
    }
    return { auth: true, decoded};
  } catch (err) {
    console.error("SESSION CHECK -> Error:", err.message);
    return { auth: false, reason: err.name, message: err.message };
  }
};

exports.logoutUser = async (token, userId) => {
  try {
    const TokenBlacklist = require("../../auth/tokenBlacklist");
    
    // Blacklist the token
    await TokenBlacklist.blacklistToken(token);
    
    // Clear user cache
    await redisClient.del(getUserCacheKey(userId));
    
    // Optional: Clear other user-related cache
    // You can add more cache clearing logic here if needed
    
    console.log(`User ${userId} logged out successfully`);
    
    return {
      success: true,
      message: "Logged out successfully"
    };
  } catch (error) {
    console.error("Logout service error:", error);
    throw {
      status: 500,
      message: "Failed to logout"
    };
  }
};
