
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { findUserById, updateUserRecord, createUserRecord } = require("../data/fallbackUsers");

const SHIP_LENGTHS = [5, 4, 3, 3, 2];
const TOTAL_SHIP_CELLS = 17;
const EXTRA_BOMBS = 20;
const ROOM_STORE_PATH = path.join(__dirname, "..", "data", "rooms.json");

const rooms = new Map();

function ensureRoomStoreFile() {
  try {
    if (!fs.existsSync(ROOM_STORE_PATH)) {
      fs.writeFileSync(ROOM_STORE_PATH, JSON.stringify([], null, 2), "utf8");
    }
  } catch (error) {
    console.warn("Could not create room store:", error.message);
  }
}

function persistRooms() {
  try {
    ensureRoomStoreFile();
    const serialized = [...rooms.values()].map((room) => ({
      code: room.code,
      gridSize: room.gridSize,
      status: room.status,
      currentTurn: room.currentTurn,
      challengePendingFor: room.challengePendingFor,
      totalHits: room.totalHits,
      winner: room.winner,
      players: [...room.players.values()].map((player) => ({
        userId: player.userId,
        username: player.username,
        fleet: player.fleet || [],
        ready: Boolean(player.ready),
        connected: Boolean(player.connected),
        shots: player.shots || [],
        remainingBombs: player.remainingBombs ?? (TOTAL_SHIP_CELLS + EXTRA_BOMBS),
        score: player.score ?? 0,
        hits: player.hits ?? 0,
        missStreak: player.missStreak ?? 0,
      })),
    }));

    fs.writeFileSync(ROOM_STORE_PATH, JSON.stringify(serialized, null, 2), "utf8");
  } catch (error) {
    console.warn("Could not persist rooms:", error.message);
  }
}

function hydrateRooms() {
  try {
    ensureRoomStoreFile();
    const content = fs.readFileSync(ROOM_STORE_PATH, "utf8").trim();

    if (!content) {
      return;
    }

    const storedRooms = JSON.parse(content);

    if (!Array.isArray(storedRooms)) {
      return;
    }

    for (const room of storedRooms) {
      if (!room || !room.code) continue;

      const restoredRoom = {
        code: room.code,
        gridSize: Number(room.gridSize) || 8,
        status: room.status || "waiting",
        currentTurn: room.currentTurn || null,
        challengePendingFor: room.challengePendingFor || null,
        totalHits: room.totalHits || 0,
        winner: room.winner || null,
        players: new Map(
          (room.players || []).map((player) => [
            String(player.userId),
            {
              userId: String(player.userId),
              socketId: null,
              username: player.username || "Player",
              fleet: Array.isArray(player.fleet) ? player.fleet : [],
              ready: Boolean(player.ready),
              connected: Boolean(player.connected),
              shots: Array.isArray(player.shots) ? player.shots : [],
              remainingBombs: Number(player.remainingBombs) || (TOTAL_SHIP_CELLS + EXTRA_BOMBS),
              score: Number(player.score) || 0,
              hits: Number(player.hits) || 0,
              missStreak: Number(player.missStreak) || 0,
            },
          ])
        ),
      };

      rooms.set(room.code, restoredRoom);
    }
  } catch (error) {
    console.warn("Could not load saved rooms:", error.message);
  }
}

hydrateRooms();

function createRoomCode() {
  return "BO-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

async function getUserRecordById(userId) {
  if (!userId) {
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const user = await User.findById(userId).select("username fullName");
      if (user) {
        return user;
      }
    } catch (error) {
      // Fallback to the local user store for non-ObjectId or locally generated IDs.
    }
  }

  return findUserById(userId);
}

function normalizeFleet(fleet, gridSize) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_LENGTHS.length) {
    return null;
  }

  const normalized = [];
  const occupied = new Set();

  for (let i = 0; i < SHIP_LENGTHS.length; i++) {
    const ship = fleet[i];
    const requiredLength = SHIP_LENGTHS[i];

    if (!Array.isArray(ship) || ship.length !== requiredLength) {
      return null;
    }

    const uniqueCells = [...new Set(ship.map((cell) => Number(cell)))];

    if (uniqueCells.length !== requiredLength) {
      return null;
    }

    const sorted = uniqueCells.sort((a, b) => a - b);
    const rows = sorted.map((cell) => Math.floor(cell / gridSize));
    const cols = sorted.map((cell) => cell % gridSize);
    const sameRow = rows.every((row) => row === rows[0]);
    const sameCol = cols.every((col) => col === cols[0]);

    if (!sameRow && !sameCol) {
      return null;
    }

    if (sameRow) {
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] !== sorted[j - 1] + 1) {
          return null;
        }
      }
    }

    if (sameCol) {
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] !== sorted[j - 1] + gridSize) {
          return null;
        }
      }
    }

    for (const cell of sorted) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= gridSize * gridSize) {
        return null;
      }

      const row = Math.floor(cell / gridSize);
      const col = cell % gridSize;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
          if (rowOffset === 0 && colOffset === 0) {
            continue;
          }

          const nextRow = row + rowOffset;
          const nextCol = col + colOffset;

          if (
            nextRow < 0 ||
            nextRow >= gridSize ||
            nextCol < 0 ||
            nextCol >= gridSize
          ) {
            continue;
          }

          const nextCell = nextRow * gridSize + nextCol;

          if (occupied.has(nextCell)) {
            return null;
          }
        }
      }

      if (occupied.has(cell)) {
        return null;
      }

      occupied.add(cell);
    }

    normalized.push(sorted);
  }

  return normalized;
}

// Validate manually placed ships.
function validateFleet(fleet, gridSize) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_LENGTHS.length) {
    return false;
  }

  const normalizedFleet = normalizeFleet(fleet, gridSize);

  if (!normalizedFleet) {
    return false;
  }

  return normalizedFleet.reduce((total, ship) => total + ship.length, 0) === TOTAL_SHIP_CELLS;
}

// Return the game information visible to one particular player.
function publicState(room, playerId) {
  const player = room.players.get(playerId);

  const opponent = [...room.players.values()].find(
    (item) => item.userId !== playerId
  );

  const opponentShots = opponent ? opponent.shots : [];

  const sunkShipCells = player.fleet.flatMap((ship) => {
    if (!Array.isArray(ship)) return [];

    const isSunk = ship.every((cell) =>
      opponentShots.some((shot) => shot.cell === cell && shot.result === "hit")
    );

    return isSunk ? ship : [];
  });

  return {
    roomCode: room.code,
    gridSize: room.gridSize,
    status: room.status,
    currentTurn: room.currentTurn,

    // Identify which player belongs to the current user.
    players: [...room.players.values()].map((item) => ({
      username: item.username,
      ready: item.ready,
      connected: item.connected,
      isMe: item.userId === playerId,
    })),

    // Only the current player's own ships are returned.
    myFleet: player.fleet,

    // Incoming shots show damage on the player's own board.
    incomingShots: opponentShots,

    // Outgoing shots show previous targets on the enemy board.
    outgoingShots: player.shots,

    // Fully destroyed ships are highlighted visibly on the board.
    sunkShipCells,

    remainingBombs: player.remainingBombs,
    score: player.score,
    hits: player.hits,
  };
}

// Send each player their own private game state.
function sendGameStates(io, room) {
  for (const player of room.players.values()) {
    const socket = io.sockets.sockets.get(player.socketId);

    if (socket) {
      socket.emit("game-state", publicState(room, player.userId));
    }
  }
}

function removeRoom(room) {
  rooms.delete(room.code);
  persistRooms();
}

function setupMultiplayer(io) {
  // Authenticate every Socket.IO connection.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required."));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id || decoded.userId;

      if (!userId) {
        return next(new Error("Invalid or expired login token."));
      }

      socket.userId = userId;

      next();
    } catch (error) {
      next(new Error("Invalid or expired login token."));
    }
  });

  io.on("connection", (socket) => {
    console.log("Authenticated player connected:", socket.id);

    // CREATE ROOM
    socket.on("create-room", async (data, callback) => {
      try {
        const user = await getUserRecordById(socket.userId);

        if (!user) {
          return callback({ ok: false, message: "Player not found." });
        }

        let code;

        do {
          code = createRoomCode();
        } while (rooms.has(code));

        const gridSize = [8, 9, 10].includes(Number(data?.gridSize))
          ? Number(data.gridSize)
          : 8;

        const room = {
          code,
          gridSize,
          status: "waiting",
          players: new Map(),
          currentTurn: null,
          challengePendingFor: null,
          totalHits: 0,
          winner: null,
        };

        room.players.set(socket.userId, {
          userId: socket.userId,
          socketId: socket.id,
          username: user.username,
          fleet: [],
          ready: false,
          connected: true,
          shots: [],
          remainingBombs: TOTAL_SHIP_CELLS + EXTRA_BOMBS,
          score: 0,
          hits: 0,
          missStreak: 0,
        });

        rooms.set(code, room);
        persistRooms();

        socket.join(code);

        callback({
          ok: true,
          roomCode: code,
          message: "Room created successfully.",
        });

        sendGameStates(io, room);
      } catch (error) {
        console.error(error);
        callback({ ok: false, message: "Unable to create room." });
      }
    });

    // JOIN ROOM
    socket.on("join-room", async (data, callback) => {
      try {
        const code = String(data?.roomCode || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
          return callback({ ok: false, message: "Room code not found." });
        }

        if (room.players.has(socket.userId)) {
          return callback({
            ok: false,
            message: "You are already in this room.",
          });
        }

        if (room.status !== "waiting" || room.players.size >= 2) {
          return callback({
            ok: false,
            message: "This room is full or no longer accepting players.",
          });
        }

        const user = await getUserRecordById(socket.userId);

        if (!user) {
          return callback({ ok: false, message: "Player not found." });
        }

        room.players.set(socket.userId, {
          userId: socket.userId,
          socketId: socket.id,
          username: user.username,
          fleet: [],
          ready: false,
          connected: true,
          shots: [],
          remainingBombs: TOTAL_SHIP_CELLS + EXTRA_BOMBS,
          score: 0,
          hits: 0,
          missStreak: 0,
        });
        persistRooms();

        socket.join(code);

        callback({
          ok: true,
          roomCode: code,
          message: "You joined the room successfully.",
        });

        sendGameStates(io, room);
      } catch (error) {
        console.error(error);
        callback({ ok: false, message: "Unable to join room." });
      }
    });

    // SUBMIT FLEET AND READY UP
    socket.on("submit-fleet", (data, callback) => {
      const room = rooms.get(data?.roomCode);

      if (!room || room.status !== "waiting") {
        return callback({ ok: false, message: "Room is not available." });
      }

      const player = room.players.get(socket.userId);

      if (!player) {
        return callback({ ok: false, message: "You are not in this room." });
      }

      const normalizedFleet = normalizeFleet(data.fleet, room.gridSize);

      if (!normalizedFleet || !validateFleet(normalizedFleet, room.gridSize)) {
        return callback({
          ok: false,
          message: "Invalid ship placement.",
        });
      }

      player.fleet = normalizedFleet;
      player.ready = true;
      persistRooms();

      if (
        room.players.size === 2 &&
        [...room.players.values()].every((item) => item.ready)
      ) {
        room.status = "playing";

        const players = [...room.players.values()];

        // Player who created the room starts.
        room.currentTurn = players[0].userId;
      }

      callback({ ok: true, message: "Fleet saved successfully." });

      sendGameStates(io, room);
    });

    // SHOOT
    socket.on("shoot", (data, callback) => {
      const room = rooms.get(data?.roomCode);

      if (!room || room.status !== "playing") {
        return callback({ ok: false, message: "Game is not active." });
      }

      if (room.currentTurn !== socket.userId) {
        return callback({ ok: false, message: "It is not your turn." });
      }

      const player = room.players.get(socket.userId);

      const opponent = [...room.players.values()].find(
        (item) => item.userId !== socket.userId
      );

      if (!player || !opponent) {
        return callback({ ok: false, message: "Opponent not found." });
      }

      const cell = Number(data.cell);

      if (
        !Number.isInteger(cell) ||
        cell < 0 ||
        cell >= room.gridSize * room.gridSize
      ) {
        return callback({ ok: false, message: "Invalid target cell." });
      }

      if (player.remainingBombs <= 0) {
        return callback({ ok: false, message: "No bombs remaining." });
      }

      if (player.shots.some((shot) => shot.cell === cell)) {
        return callback({
          ok: false,
          message: "You have already targeted this cell.",
        });
      }

      const hit = opponent.fleet.some((ship) => ship.includes(cell));

      player.shots.push({
        cell,
        result: hit ? "hit" : "miss",
      });

      player.remainingBombs -= 1;

      let sunk = false;
      let challengeRequired = false;
      let sunkShipCells = [];

      if (hit) {
        player.score += 10;
        player.hits += 1;
        player.missStreak = 0;
        room.totalHits += 1;

        // Check whether the complete ship has been destroyed.
        const sunkShip = opponent.fleet.find((ship) => {
          const shipHits = ship.filter((shipCell) =>
            player.shots.some(
              (shot) => shot.cell === shipCell && shot.result === "hit"
            )
          );

          return shipHits.length === ship.length && ship.includes(cell);
        });

        sunk = Boolean(sunkShip);
        sunkShipCells = sunk ? sunkShip : [];
      } else {
        player.missStreak = (player.missStreak || 0) + 1;
        challengeRequired = player.missStreak >= 3;

        if (challengeRequired) {
          room.challengePendingFor = player.userId;
          room.currentTurn = player.userId;
        } else {
          room.challengePendingFor = null;
          room.currentTurn = opponent.userId;
        }
      }

      let gameOver = false;

      if (room.totalHits === TOTAL_SHIP_CELLS) {
        gameOver = true;
        room.status = "finished";
        room.winner = player.userId;
      } else if (player.remainingBombs === 0) {
        gameOver = true;
        room.status = "finished";
        room.winner = null;
      }

      callback({
        ok: true,
        result: hit ? "hit" : "miss",
        sunk,
        sunkShipCells,
        gameOver,
        challengeRequired,
      });

      persistRooms();

      if (gameOver) {
        finishGame(io, room);
      } else {
        sendGameStates(io, room);
      }
    });

    socket.on("resolve-fish-challenge", (data, callback) => {
      const room = rooms.get(data?.roomCode);

      if (!room || room.status !== "playing") {
        return callback({ ok: false, message: "Game is not active." });
      }

      if (room.challengePendingFor !== socket.userId) {
        return callback({ ok: false, message: "No active challenge for this player." });
      }

      const player = room.players.get(socket.userId);
      const opponent = [...room.players.values()].find(
        (item) => item.userId !== socket.userId
      );

      if (!player || !opponent) {
        return callback({ ok: false, message: "Opponent not found." });
      }

      player.missStreak = 0;
      room.challengePendingFor = null;
      room.currentTurn = opponent.userId;
      persistRooms();

      callback({
        ok: true,
        correct: Boolean(data?.correct),
        message: data?.correct ? "Challenge solved." : "Challenge failed.",
      });

      sendGameStates(io, room);
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);

      for (const room of rooms.values()) {
        const player = room.players.get(socket.userId);

        if (player && player.socketId === socket.id) {
          player.connected = false;

          io.to(room.code).emit("opponent-disconnected", {
            username: player.username,
          });

          // Disconnection does not automatically end the game.
          // Reconnection support will be added separately.
        }
      }
    });
  });
}

// Update player records when the game ends.
async function finishGame(io, room) {
  try {
    const players = [...room.players.values()];

    for (const player of players) {
      if (mongoose.connection.readyState === 1) {
        await User.findByIdAndUpdate(player.userId, {
          $inc: {
            totalScore: player.score,
            gamesPlayed: 1,
            wins: room.winner === player.userId ? 1 : 0,
          },
        });
      } else {
        const existing = findUserById(player.userId) || createUserRecord({
          _id: player.userId,
          fullName: player.username,
          username: player.username,
          email: `${player.username}@local.test`,
          password: "local-fallback",
        });

        updateUserRecord(player.userId, {
          totalScore: (existing.totalScore ?? 0) + player.score,
          gamesPlayed: (existing.gamesPlayed ?? 0) + 1,
          wins: room.winner === player.userId ? (existing.wins ?? 0) + 1 : existing.wins ?? 0,
        });
      }
    }

    for (const player of players) {
      const socket = io.sockets.sockets.get(player.socketId);

      if (socket) {
        socket.emit("game-finished", {
          winner: room.winner,
          yourId: player.userId,
          yourScore: player.score,
        });
      }
    }

    // Keep the finished room briefly for result display.
    setTimeout(() => removeRoom(room), 60000);
  } catch (error) {
    console.error("Could not save multiplayer results:", error);
  }
}

module.exports = setupMultiplayer;
