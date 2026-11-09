
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  createUserRecord,
  findUserByEmail,
} = require("../data/fallbackUsers");

const router = express.Router();

// Generate authentication token
function generateToken(userId) {
  return jwt.sign(
    { id: userId, userId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

// ==================================
// SIGN UP
// ==================================

router.post(["/register", "/signup"], async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({
        message: "Please fill in all required fields.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    const existingUser = isDatabaseReady()
      ? await User.findOne({
          $or: [
            { email: normalizedEmail },
            { username: normalizedUsername },
          ],
        })
      : findUserByEmail(normalizedEmail) ||
        (() => {
          const userStore = require("../data/fallbackUsers");
          for (const user of userStore.fallbackUsers.values()) {
            if (user.username === normalizedUsername) {
              return user;
            }
          }
          return null;
        })();

    if (existingUser) {
      return res.status(409).json({
        message: "Email or username is already registered.",
      });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = isDatabaseReady()
      ? await User.create({
          fullName: fullName.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          password: hashedPassword,
        })
      : createUserRecord({
          fullName: fullName.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          password: hashedPassword,
        });

    const token = generateToken(String(newUser._id || newUser.id));

    res.status(201).json({
      message: "Account created successfully!",
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        totalScore: newUser.totalScore,
        bestScore: newUser.bestScore,
        gamesPlayed: newUser.gamesPlayed,
        wins: newUser.wins,
        losses: newUser.losses,
        coins: newUser.coins,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      message: "Could not create your account.",
    });
  }
});

// ==================================
// SIGN IN
// ==================================

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please log in to access this page.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid or expired login session.",
      });
    }

    const user = isDatabaseReady()
      ? await User.findById(userId).select("-password")
      : require("../data/fallbackUsers").findUserById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Player not found.",
      });
    }

    res.json({ user });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired login session.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please enter your email and password.",
      });
    }

    const user = isDatabaseReady()
      ? await User.findOne({
          email: email.trim().toLowerCase(),
        }).select("+password")
      : require("../data/fallbackUsers").findUserByEmail(email.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(String(user._id || user.id));

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        totalScore: user.totalScore,
        bestScore: user.bestScore,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        losses: user.losses,
        coins: user.coins,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Could not log in.",
    });
  }
});

module.exports = router;
