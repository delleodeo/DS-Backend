const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const routes = require("./routes");
const passport = require("./modules/users/passport");
const cookieParser = require("cookie-parser");
const { createSession } = require("./auth/session");

// middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(createSession);
app.use(
  cors({
    origin: [
      "https://darylbacongco.me",
      "http://localhost:3000"
    ], // your actual frontend domain
    credentials: true, // VERY IMPORTANT — allows cookies
  })
);

app.use(cookieParser())
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use("/v1", routes);

module.exports = app;
