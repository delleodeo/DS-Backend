require("dotenv").config();
const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;

// Fail-fast in production if SECRET_KEY is not configured or left as insecure default
if (process.env.NODE_ENV === 'production' && (!SECRET || SECRET.trim() === '')) {
  throw new Error('FATAL: SECRET_KEY must be set in production environment');
}

if (!SECRET) {
  // In non-production envs, use a dev secret but warn
  console.warn('Warning: SECRET_KEY not set. Using insecure default for development. Do not use in production.');
}

exports.createToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, SECRET || 'your_secret_key', {
    expiresIn: "7d",
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, SECRET || 'your_secret_key');
};

