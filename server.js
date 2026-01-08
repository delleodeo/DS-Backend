require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const cacheProduct = require("./config/cacheProduct");
const { connectRedis } = require("./config/redis");
const { resetAllNew } = require("./modules/admin/resetAllNew");
const { initSocket } = require("./config/socket");
const { startMonthlyRevenueCron } = require("./utils/monthlyRevenueCron");
const { startImageCleanupCron } = require("./utils/imageCleanupCron");
const { startPromotionExpirationCron } = require("./utils/promotionExpirationCron");
const { startQRFileCleanupCron } = require("./utils/qrFileCleanupCron");
const { startCommissionReminderCron } = require("./utils/commissionReminderCron");
const http = require('http');

resetAllNew();
const PORT = process.env.PORT || 3002; // Changed to 3002 to avoid conflicts

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    await cacheProduct();
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize Socket.IO
    const io = initSocket(server);
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📡 Socket.IO enabled for real-time messaging`);
      console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/socket.io/`);
    });

    // Start monthly revenue cron job
    startMonthlyRevenueCron();
    
    // Start image cleanup cron job
    startImageCleanupCron();
    
    // Start promotion expiration cron job
    startPromotionExpirationCron();
    
    // Start QR file cleanup cron job
    startQRFileCleanupCron();

    // Start commission reminder cron job (daily at 9 AM)
    startCommissionReminderCron();

    // Export server and io for potential use in other modules
    module.exports = { app, server, io };
    
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
