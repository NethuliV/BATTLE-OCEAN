const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_PATH = path.join(__dirname, "fallbackUsers.json");
const fallbackUsers = new Map();

function toObjectIdLike(value) {
  return String(value);
}

function ensureStoreFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.warn("Unable to initialize fallback user store:", error.message);
  }
}

function persistUsers() {
  try {
    ensureStoreFile();
    const raw = JSON.stringify([...fallbackUsers.values()], null, 2);
    fs.writeFileSync(STORE_PATH, raw, "utf8");
    return true;
  } catch (error) {
    console.warn("Could not persist fallback users:", error.message);
    return false;
  }
}

function hydrateUsers() {
  try {
    ensureStoreFile();
    const content = fs.readFileSync(STORE_PATH, "utf8").trim();

    if (!content) {
      return;
    }

    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      return;
    }

    for (const user of parsed) {
      if (!user || !user.email || !user.username) continue;
      const id = toObjectIdLike(user._id || user.id || crypto.randomBytes(12).toString("hex"));
      fallbackUsers.set(id, {
        ...user,
        _id: id,
        id,
      });
    }
  } catch (error) {
    console.warn("Could not load fallback users:", error.message);
  }
}

hydrateUsers();

function createUserRecord(data) {
  const id = toObjectIdLike(data._id || data.id || crypto.randomBytes(12).toString("hex"));

  const user = {
    _id: id,
    id,
    fullName: data.fullName,
    username: data.username,
    email: data.email,
    password: data.password,
    totalScore: data.totalScore ?? 0,
    bestScore: data.bestScore ?? 0,
    gamesPlayed: data.gamesPlayed ?? 0,
    wins: data.wins ?? 0,
    losses: data.losses ?? 0,
    coins: data.coins ?? 0,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };

  fallbackUsers.set(id, user);
  persistUsers();
  return user;
}

function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  for (const user of fallbackUsers.values()) {
    if (String(user.email || "").trim().toLowerCase() === normalizedEmail) {
      return user;
    }
  }

  return null;
}

function findUserById(userId) {
  if (!userId) return null;
  return fallbackUsers.get(String(userId)) || null;
}

function updateUserRecord(userId, updates) {
  const existing = findUserById(userId);

  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...updates,
    id: String(userId),
    _id: String(userId),
    updatedAt: new Date().toISOString(),
  };

  fallbackUsers.set(String(userId), updated);
  persistUsers();
  return updated;
}

module.exports = {
  fallbackUsers,
  createUserRecord,
  findUserByEmail,
  findUserById,
  updateUserRecord,
};
