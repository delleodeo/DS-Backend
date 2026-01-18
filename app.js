const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const routes = require("./routes");
const passport = require("./modules/users/passport");
const cookieParser = require("cookie-parser");
const { createSession } = require("./auth/session");
const rateLimiter = require("./utils/rateLimiter");
const { errorHandler } = require("./utils/errorHandler");
const helmet = require("helmet");


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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(rateLimiter({ windowSec: 60, maxRequests: 1500, keyPrefix: "global" }));
app.use(createSession);
app.use(
  cors({
    origin: [
      "https://darylbacongco.me",
      "http://127.0.0.1:5500",
      "http://localhost:3000",
      "http://localhost:3001", 
      "http://localhost:3002",
      "http://localhost:5173",
      "http://192.168.1.7:3002",
      "http://localhost:4173", 
    ], 
    credentials: true, // VERY IMPORTANT — allows cookies
  })
);


app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());
app.use(morgan("dev"));

// Serve static files for testing
app.use(express.static("public"));

app.use("/v1", routes);

app.use(errorHandler);

module.exports = app;
