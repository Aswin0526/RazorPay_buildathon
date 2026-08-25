const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
require("dotenv").config();
const { ensureGlobalProductsView } = require("./config/database");
const customerRoutes = require("./routes/customerRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const locationRoutes = require("./routes/locationRoutes");
const { refreshAccessToken } = require("./controllers/authController");

const app = express();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

console.log(process.env.FRONTEND_URL)
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(morgan("dev"));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  req.upload = upload;
  next();
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ShopMate API is running",
    version: "1.0.0",
  });
});

app.use("/api/customers", customerRoutes);
app.use("/api/owners", ownerRoutes);
app.use("/api/locations", locationRoutes);
app.post("/api/auth/refresh", refreshAccessToken);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, async () => {
  try {
    await ensureGlobalProductsView();
    console.log("Global products view is ready.");
  } catch (error) {
    console.error("Failed to initialize global products view:", error.message);
  }

  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;
