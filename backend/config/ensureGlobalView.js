require("dotenv").config();
const { ensureGlobalProductsView } = require("./database");

ensureGlobalProductsView()
  .then(() => {
    console.log("Global products view refreshed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to create or refresh global products view:", error);
    process.exit(1);
  });
