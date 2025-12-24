// auth.js
const { verifyToken } = require("./token.js");
const TokenBlacklist = require("./tokenBlacklist.js");

exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.split(" ")[1];
    
    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ message: "Token has been invalidated" });
    }
    
    const decoded = verifyToken(token);
    req.user = decoded;
    req.token = token; // Store token for potential logout
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

exports.optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    
    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.isTokenBlacklisted(token);
    if (isBlacklisted) {
      req.user = null;
      return next();
    }
    
    const decoded = verifyToken(token);
    req.user = decoded;
    req.token = token; // Store token for potential logout
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden - Role not allowed" });
    }
    next();
  };
};


