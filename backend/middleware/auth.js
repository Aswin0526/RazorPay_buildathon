const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Access token expired. Please refresh your token.",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

const isCustomer = (req, res, next) => {
  if (req.user.type !== "customer") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Customer only.",
    });
  }
  next();
};

const isOwner = (req, res, next) => {
  if (req.user.type !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Owner only.",
    });
  }
  next();
};

module.exports = {
  verifyToken,
  isCustomer,
  isOwner,
};
