const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * QR Code File Management Service
 * Handles cleanup of expired QR code files
 */

class QRFileService {
  constructor() {
    this.qrDirectory = path.join(__dirname, '../public/qr-codes');
    this.maxFileAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Clean up expired QR code files
   * Should be called periodically by a cron job
   */
  async cleanupExpiredFiles() {
    try {
      if (!fs.existsSync(this.qrDirectory)) {
        logger.info('QR codes directory does not exist, skipping cleanup');
        return;
      }

      const files = fs.readdirSync(this.qrDirectory);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.qrDirectory, file);
          const stats = fs.statSync(filePath);
          const fileAge = now - stats.mtime.getTime();

          if (fileAge > this.maxFileAge) {
            fs.unlinkSync(filePath);
            deletedCount++;
            logger.debug(`Deleted expired QR file: ${file}`);
          }
        } catch (error) {
          logger.error(`Error processing QR file ${file}:`, error.message);
        }
      }

      if (deletedCount > 0) {
        logger.info(`QR cleanup completed: deleted ${deletedCount} expired files`);
      }

    } catch (error) {
      logger.error('Error during QR file cleanup:', error);
    }
  }

  /**
   * Get stats about QR files directory
   */
  async getDirectoryStats() {
    try {
      if (!fs.existsSync(this.qrDirectory)) {
        return { exists: false, fileCount: 0, totalSize: 0 };
      }

      const files = fs.readdirSync(this.qrDirectory);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.qrDirectory, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }

      return {
        exists: true,
        fileCount: files.length,
        totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
      };
    } catch (error) {
      logger.error('Error getting QR directory stats:', error);
      return { exists: false, fileCount: 0, totalSize: 0, error: error.message };
    }
  }
}

module.exports = new QRFileService();