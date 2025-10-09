const session = require("express-session");
const MongoStore = require("connect-mongo"); 
require("dotenv").config();

exports.createSession = session({
  secret: process.env.SESSION_SECRET || "sample",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI, 
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true, 
    maxAge: 1000 * 60 * 60 * 24, 
  },
})