
const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get logged-in player's profile
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "Player not found.",
      });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({
      message: "Could not retrieve player profile.",
    });
  }
});

// Save a completed game's result
router.post("/game-result", authMiddleware, async (req, res) => {
  try {
    const { score, result } = req.body;

    if (
      !Number.isSafeInteger(score) ||
      score < 0 ||
      !["win", "loss"].includes(result)
    ) {
      return res.status(400).json({
        message: "Invalid game result.",
      });
    }

    const update = {
      $inc: {
        gamesPlayed: 1,
        totalScore: score,
        ...(result === "win"
          ? { wins: 1, coins: 50 }
          : { losses: 1 }),
      },
      $max: {
        bestScore: score,
      },
    };

    const user = await User.findByIdAndUpdate(
      req.userId,
      update,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "Player not found.",
      });
    }

    res.json({
      message: "Game result saved successfully!",
      user,
    });
  } catch (error) {
    console.error("Game result error:", error);

    res.status(500).json({
      message: "Could not save game result.",
    });
  }
});

module.exports = router;
