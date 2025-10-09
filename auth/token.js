require("dotenv").config();
const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY || "your_secret_key";

exports.createToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, SECRET, {
    expiresIn: "7d",
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};

