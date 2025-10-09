require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const cacheProduct = require("./config/cacheProduct");
const { resetAllNew } = require("./modules/admin/resetAllNew");

resetAllNew();
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await cacheProduct();
    app.listen(PORT, () => console.log(` Server running at http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
