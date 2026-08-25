const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  getLogo,
  getShopImages,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  logoutOwner,
  getAvgRatings,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  approveOrder,
  markDone,
  markOrderDoneAndDelete,
  updateOwnerProfile,
  updateShopProfile,
  getShopHitCount,
  WishListCount,
  getMostWantedProducts,
  getConversationAnalyses,
  getProductDirections,
  addProductDirections,
  updateProductDirections,
} = require("../controllers/ownerController");
const { verifyToken, isOwner, isCustomer } = require("../middleware/auth");

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Public routes
router.post("/register", registerOwner);
router.post("/register-basic", registerOwnerBasic);
router.post("/upload-image", uploadShopImage);
router.post("/complete-registration", completeRegistration);
router.post("/get-logo", getLogo);
router.post("/get-shop-images", getShopImages);
router.post("/login", loginOwner);
router.post("/getfeedbacks", verifyToken, getFeedBack);
router.post("/getAvgRatings", verifyToken, getAvgRatings);

// Protected routes
router.get("/profile", verifyToken, isOwner, getOwnerProfile);
router.put("/updateOwnerProfile", verifyToken, isOwner, updateOwnerProfile);
router.put("/updateShopProfile", verifyToken, isOwner, updateShopProfile);
router.post("/logout", logoutOwner);

// Product management routes
router.post("/get-products", verifyToken, getProducts);
router.post("/add-product", verifyToken, isOwner, addProduct);
router.post("/update-product", verifyToken, isOwner, updateProduct);
router.post("/delete-product", verifyToken, isOwner, deleteProduct);

//order management routes
router.post("/getOrders", verifyToken, isOwner, getOrders);
router.post("/approve", verifyToken, isOwner, approveOrder);
router.post("/markDone", verifyToken, isOwner, markOrderDoneAndDelete);

// graph
router.post("/shop-hit-count", verifyToken, isOwner, getShopHitCount);
router.post("/wishlist-hit-count", verifyToken, isOwner, WishListCount);
router.post("/most-wanted-products", verifyToken, isOwner, getMostWantedProducts);

// conversation analyses
router.post("/conversation-analyses", verifyToken, isOwner, getConversationAnalyses);

// product directions
router.post("/get-product-directions", verifyToken, getProductDirections);
router.post("/add-product-directions", verifyToken, isOwner, addProductDirections);
router.post("/update-product-directions", verifyToken, isOwner, updateProductDirections);

module.exports = router;

