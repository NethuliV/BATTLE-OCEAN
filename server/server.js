
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
const setupMultiplayer = require("./multiplayer/multiplayerHandler");

// ========================================
// LOAD ENVIRONMENT VARIABLES
// ========================================

dotenv.config({
  path: path.resolve(__dirname, ".env"),
});

// ========================================
// INITIALIZE EXPRESS AND HTTP SERVER
// ========================================

const app = express();
const httpServer = http.createServer(app);

// ========================================
// CORS CONFIGURATION
// ========================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4174",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        callback(null, true);
        return;
      }

      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

// ========================================
// INITIALIZE SOCKET.IO
// ========================================

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Register multiplayer event handlers.
setupMultiplayer(io);

// ========================================
// API ROUTES
// ========================================

// Authentication routes
app.use("/api/auth", authRoutes);

// Player profile routes
app.use("/api/profile", profileRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Battle Ocean backend is running!",
  });
});

// Health check
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
// FISH API QUESTION SYSTEM
// ========================================

// Store active Fish API challenges.
const fishChallenges = new Map();

// Get a Fish API question.
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

    const challengeId = crypto.randomUUID();

    fishChallenges.set(challengeId, {
      answer: String(solution).trim(),
      expiresAt: Date.now() + 15000,
    });

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

// Submit a Fish API answer.
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

  // Prevent reusing the same challenge.
  fishChallenges.delete(challengeId);

  if (Date.now() > challenge.expiresAt) {
    return res.json({
      correct: false,
      message: "Time expired!",
    });
  }

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

async function connectToMongo() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/battleocean";

  if (!process.env.MONGODB_URI) {
    console.warn(
      "MONGODB_URI is not set. Trying the local MongoDB instance at mongodb://127.0.0.1:27017/battleocean."
    );
  }

  try {
    await Promise.race([
      mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 15000,
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("MongoDB connection timed out.")),
          5000
        );
      }),
    ]);

    console.log("MongoDB connected successfully!");
    return true;
  } catch (error) {
    console.warn(
      "MongoDB connection failed. Continuing in local fallback mode:",
      error.message
    );

    mongoose.connection.on("error", (err) => {
      console.warn("MongoDB runtime error:", err.message);
    });

    return false;
  }
}

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
    await connectToMongo();

    const candidatePorts = [
      PORT,
      5001,
      5002,
      5003,
      5004,
      5005,
      5006,
      5007,
      5008,
      5009,
    ];

    for (const port of candidatePorts) {
      try {
        await listenOnPort(port);

        console.log(
          `Battle Ocean server running on port ${port}`
        );

        return;
      } catch (error) {
        if (error.code !== "EADDRINUSE") {
          throw error;
        }

        console.warn(`Port ${port} is already in use.`);
      }
    }

    throw new Error(
      "No free server port available. Stop the other Node.js process."
    );
  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
