require("dotenv").config();
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const User = require("./users.model");
const { findOrCreateSocialUser } = require("./users.service");

// Base URL: fallback to localhost if not provided
const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3001/v1/user/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateSocialUser(profile, "google");
        if (!user) {
          return done(null, false, { message: "Failed to create or find user" });
        }
        return done(null, user);
      } catch (err) {
        console.error("Google strategy error:", err);
        return done(err, null);
      }
    }
  )
);

// Facebook Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: `http://localhost:3001/v1/user/facebook/callback`,
      profileFields: ["id", "emails", "displayName"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateSocialUser(profile, "facebook");
        if (!user) {
          return done(null, false, { message: "Failed to create or find user" });
        }
        return done(null, user);
      } catch (err) {
        console.error("Facebook strategy error:", err);
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
