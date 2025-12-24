const mongoose = require('mongoose');
require("dotenv").config()

const connectDB = async () => {
  try {
    const options = {
      // Connection Pool Settings
      maxPoolSize: 10,        // Maximum number of connections in the connection pool
      minPoolSize: 5,         // Minimum number of connections in the connection pool
      maxIdleTimeMS: 30000,   // Close connections after 30 seconds of inactivity
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      // bufferCommands: false,  // Removed - deprecated option
      // bufferMaxEntries: 0,    // Removed - deprecated option

      // Retry Logic
      retryWrites: true,      // Enable retryable writes
      retryReads: true,       // Enable retryable reads

      // SSL/TLS (if needed for production)
      // ssl: true,
      // tlsCAFile: process.env.CA_CERT_PATH,

      // Monitoring and Logging
      monitorCommands: process.env.NODE_ENV === 'development'
    };

    await mongoose.connect(process.env.MONGO_URI, options);

    console.log('MongoDB connected with connection pooling enabled');
    console.log(`Connection pool: min=${options.minPoolSize}, max=${options.maxPoolSize}`);

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected from MongoDB');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
