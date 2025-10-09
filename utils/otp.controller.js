const User = require("../modules/users/users.model")
const redisClient = require("../config/redis.js")
const { sendVerificationEmail } = require("./verification")
const userRedisOtpKey = (email) => `opt:${email}`;

exports.requestRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // 5 minutes
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const createOpt = {
      email,
      otp,
      otpExpiry
    }

    await redisClient.set(userRedisOtpKey(email), JSON.stringify(createOpt), {
      EX: 300,
    });
    await sendVerificationEmail(email, otp);
    res.status(200).json({ message: "Verification code sent to email." });
  } catch (err) {
    console.error("OTP request error:", err);
    res.status(500).json({ error: "Failed to send verification code" });
  }
};
