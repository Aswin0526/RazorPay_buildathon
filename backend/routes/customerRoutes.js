const express = require("express");
const router = express.Router();
const {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  logoutCustomer,
  getShopInLoc,
  getShopDetails,
  addWishList,
  getWishList,
  deleteWishlist,
  order,
  getOrders,
  handleFeedbackSubmit,
  updateCustomerProfile,
  handleShopPoint,
  getMostNeeded,
  addVote,
  addProduct
} = require("../controllers/customerController");
const { verifyToken, isCustomer } = require("../middleware/auth");

// Public routes
router.post("/register", registerCustomer);
router.post("/login", loginCustomer);

router.post("/getShopInLoc", verifyToken, isCustomer, getShopInLoc);
router.post("/getShopDetails", verifyToken, isCustomer, getShopDetails);

router.get("/profile", verifyToken, isCustomer, getCustomerProfile);
router.post("/profile", verifyToken, isCustomer, getCustomerProfile);
router.put("/updateProfile", verifyToken, isCustomer, updateCustomerProfile);
router.post("/logout", logoutCustomer);

router.post("/addWishList", verifyToken, isCustomer, addWishList);
router.post("/getWishList", verifyToken, isCustomer, getWishList);
router.post("/deleteWishList", verifyToken, isCustomer, deleteWishlist);
router.post("/order", verifyToken, isCustomer, order);
router.post("/getOrders", verifyToken, isCustomer, getOrders);

router.post("/addfeedback", verifyToken, isCustomer, handleFeedbackSubmit);

router.post("/addShopPoint", verifyToken, isCustomer, handleShopPoint);
router.post("/getMostNeeded", verifyToken, isCustomer, getMostNeeded);
router.post("/addVote", verifyToken, isCustomer, addVote);
router.post("/addProduct", verifyToken, isCustomer, addProduct);

module.exports = router;
