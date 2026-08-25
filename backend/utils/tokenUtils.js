const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
};

const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString("hex");
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
};
