const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const routes = require("./routes");
const passport = require("./modules/users/passport");
const cookieParser = require("cookie-parser");
const { createSession } = require("./auth/session");
const rateLimiter = require("./utils/rateLimiter");
const logger = require("./utils/logger");
const { errorHandler } = require("./utils/errorHandler");
const helmet = require("helmet");

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = [
  "https://darylbacongco.me",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5173",
  "http://192.168.1.8:3002",
  "http://165.22.109.100",
  "http://165.22.109.100:3002",
  "http://localhost:4173",
];

// middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(rateLimiter({ windowSec: 60, maxRequests: 1500, keyPrefix: "global" }));
app.use(createSession);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  })
);

app.options("*", cors());

app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());
app.use(morgan("dev"));

// Serve static files for testing
app.use(express.static("public"));

app.use("/v1", routes);

// Centralized error handler - ensures consistent error responses
app.use(errorHandler);

module.exports = app;
