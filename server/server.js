
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const axios = require("axios");
const crypto = require("crypto");
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Initialize Express
const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

// ========================================
// BASIC BACKEND ROUTES
// ========================================

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Battle Ocean backend is running!",
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// ========================================
// SOCKET.IO CONNECTION
// ========================================

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

// ========================================
// FISH API QUESTION SYSTEM
// ========================================

// Store active Fish API challenges
const fishChallenges = new Map();

// Get a Fish API question
app.get("/api/fish/question", async (req, res) => {
  try {
    const response = await axios.get(
      "https://marcconrad.com/uob/fish/api.php?out=json",
      {
        timeout: 10000,
      }
    );

    const data = response.data;

    const imageUrl = data.question || data.image || data.url;
    const solution =
      data.solution ??
      data.answer ??
      data.fish ??
      data.count ??
      data.result;

    if (!imageUrl || solution === undefined) {
      return res.status(502).json({
        message: "Unexpected response from the Fish API.",
      });
    }

    // Generate a unique challenge ID
    const challengeId = crypto.randomUUID();

    // Store the correct answer on the backend
    fishChallenges.set(challengeId, {
      answer: String(solution).trim(),
      expiresAt: Date.now() + 15000,
    });

    // Send the question to the frontend
    res.json({
      challengeId,
      imageUrl,
      timeLimit: 15,
    });
  } catch (error) {
    console.error("Fish API error:", error.message);

    res.status(502).json({
      message: "Could not load a Fish API question. Please retry.",
    });
  }
});

// Submit the Fish API answer
app.post("/api/fish/answer", (req, res) => {
  const { challengeId, answer } = req.body;

  if (!challengeId || answer === undefined) {
    return res.status(400).json({
      correct: false,
      message: "Challenge ID and answer are required.",
    });
  }

  const challenge = fishChallenges.get(challengeId);

  if (!challenge) {
    return res.status(400).json({
      correct: false,
      message: "This challenge is invalid or already used.",
    });
  }

  // Remove the challenge so it cannot be reused
  fishChallenges.delete(challengeId);

  // Check whether the time has expired
  if (Date.now() > challenge.expiresAt) {
    return res.json({
      correct: false,
      message: "Time expired!",
    });
  }

  // Check the submitted answer
  const correct =
    String(answer).trim() === challenge.answer;

  res.json({
    correct,
    message: correct
      ? "Correct! Return to battle."
      : "Incorrect answer!",
  });
});

// ========================================
// SERVER STARTUP AND MONGODB CONNECTION
// ========================================

const PORT = Number(process.env.PORT) || 5000;

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      httpServer.removeListener("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.removeListener("error", onError);
      resolve();
    };

    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port);
  });
}

async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.warn(
        "MONGODB_URI is not set. Starting server without a MongoDB connection."
      );
    } else {
      await mongoose.connect(mongoUri);
      console.log("MongoDB connected successfully!");
    }

    const candidatePorts = [PORT, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009];
    let portInUse = false;

    for (const port of candidatePorts) {
      try {
        await listenOnPort(port);
        console.log(`Battle Ocean server running on port ${port}`);
        process.env.PORT = String(port);
        return;
      } catch (error) {
        if (error.code !== "EADDRINUSE") {
          throw error;
        }

        portInUse = true;
      }
    }

    if (portInUse) {
      console.error(
        "No free port available. Please stop the stale Node process or set a different PORT value."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
