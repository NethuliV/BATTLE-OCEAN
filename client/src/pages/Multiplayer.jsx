
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import { API_URL } from "../context/AuthContext";
import {
  SHIPS,
  generateRandomFleet as generateFleetUtil,
  canPlaceShip,
} from "../utils/shipPlacement.js";

import "../Auth.css";
import "./Multiplayer.css";

const SERVER_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function getUserIdFromToken(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized));
    return String(decoded.id || decoded.userId || "");
  } catch {
    return null;
  }
}

export default function Multiplayer() {
  const socketRef = useRef(null);

  const [screen, setScreen] = useState("menu");
  const [roomCode, setRoomCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [gridSize, setGridSize] = useState(8);

  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [fleet, setFleet] = useState([]);
  const [shipIndex, setShipIndex] = useState(0);
  const [orientation, setOrientation] = useState("horizontal");

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState("");
  const [sunkShipCells, setSunkShipCells] = useState([]);
  const [challengeError, setChallengeError] = useState("");
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [loadingChallenge, setLoadingChallenge] = useState(false);

  const token = localStorage.getItem("battleOceanToken");

  const currentUserId = getUserIdFromToken(token || "");

  // Connect to the multiplayer server.
  useEffect(() => {
    if (!token) {
      setError("Please log in before entering multiplayer.");
      return;
    }

    const socket = io(SERVER_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
      autoConnect: true,
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect_error", (err) => {
      setError(err.message || "Could not connect to the game server.");
    });

    socket.on("game-state", (state) => {
      setGame(state);
      setRoomCode(state.roomCode);

      // Always use the grid size selected by the room creator.
      setGridSize(state.gridSize);

      setScreen(
        state.status === "finished" ? "finished" : "lobby"
      );

      if (state.status === "playing") {
        setMessage("Battle in progress!");
      } else if (state.status === "waiting") {
        setMessage("Waiting for both players to get ready.");
      }
    });

    socket.on("opponent-disconnected", (data) => {
      setMessage(
        `${data?.username || "Your opponent"} has disconnected.`
      );
    });

    socket.on("game-finished", (result) => {
      if (result.winner === result.yourId) {
        setMessage(
          `VICTORY! You scored ${result.yourScore} points.`
        );
      } else if (result.reason === "challenge-failed") {
        setMessage("MISSION FAILED! You did not solve the Fish API challenge.");
      } else if (result.winner) {
        setMessage("You lost this battle. Better luck next time!");
      } else {
        setMessage("The battle ended in a draw.");
      }

      setScreen("finished");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Check whether the current player has submitted their fleet.
  const myPlayer = game?.players?.find((player) => player.isMe);
  const myReady = Boolean(myPlayer?.ready);

  // Communicate with the backend using Socket.IO acknowledgements.
  const emitWithAck = (event, data) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        reject(new Error("Not connected to the game server."));
        return;
      }

      socket.timeout(10000).emit(event, data, (err, response) => {
        if (err) {
          reject(new Error("The server did not respond."));
          return;
        }

        if (!response?.ok) {
          reject(
            new Error(response?.message || "Something went wrong.")
          );
          return;
        }

        resolve(response);
      });
    });
  };

  // Create a new room.
  const createRoom = async () => {
    setError("");
    setBusy(true);

    try {
      const response = await emitWithAck("create-room", {
        gridSize,
      });

      setRoomCode(response.roomCode);
      setMessage("Share your invitation code with a friend.");
      setScreen("lobby");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Join an existing room.
  const joinRoom = async () => {
    setError("");
    setBusy(true);

    try {
      const response = await emitWithAck("join-room", {
        roomCode: enteredCode.trim().toUpperCase(),
      });

      setRoomCode(response.roomCode);
      setMessage("You joined the room successfully.");
      setScreen("lobby");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Copy the invitation code.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
    } catch {
      setError("Could not copy the code. Please copy it manually.");
    }
  };

  // Calculate the cells occupied by a ship.
  const getShipCells = (startCell, length) => {
    const size = game?.gridSize || gridSize;

    const row = Math.floor(startCell / size);
    const col = startCell % size;

    const cells = [];

    for (let i = 0; i < length; i++) {
      const nextRow =
        row + (orientation === "vertical" ? i : 0);

      const nextCol =
        col + (orientation === "horizontal" ? i : 0);

      if (nextRow >= size || nextCol >= size) {
        return null;
      }

      cells.push(nextRow * size + nextCol);
    }

    return cells;
  };

  const normalizeFleet = (shipArray) =>
    shipArray.map((ship) =>
      [...new Set(ship)]
        .map((cell) => Number(cell))
        .sort((a, b) => a - b)
    );

  const generateRandomFleet = () => {
    const size = game?.gridSize || gridSize;
    const generated = generateFleetUtil(size, SHIPS);

    if (!generated) {
      setError("Could not auto-place a valid fleet. Please arrange ships manually.");
      return false;
    }

    setFleet(generated);
    setShipIndex(SHIPS.length);
    setError("");
    return true;
  };

  // Place the next ship on the player's grid.
  const placeShip = (cell) => {
    if (game?.status !== "waiting" || myReady) return;

    if (shipIndex >= SHIPS.length) return;

    const cells = getShipCells(cell, SHIPS[shipIndex]);

    if (!cells) {
      setError("This ship will go outside the grid.");
      return;
    }

    const occupiedSet = new Set(fleet.flat());

    if (!canPlaceShip(cells, occupiedSet, game?.gridSize || gridSize)) {
      setError("Ships cannot overlap or touch each other.");
      return;
    }

    setError("");

    setFleet((previousFleet) => [...previousFleet, cells]);
    setShipIndex((previousIndex) => previousIndex + 1);
  };

  // Remove the most recently placed ship.
  const undoShip = () => {
    if (fleet.length === 0 || myReady) return;

    setFleet((previousFleet) => previousFleet.slice(0, -1));
    setShipIndex((previousIndex) => Math.max(0, previousIndex - 1));
    setError("");
  };

  // Submit the player's fleet.
  const submitFleet = async () => {
    const normalizedFleet = normalizeFleet(fleet);

    if (normalizedFleet.length !== SHIPS.length) {
      setError("Please place all five ships first.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await emitWithAck("submit-fleet", {
        roomCode,
        fleet: normalizedFleet,
      });

      setMessage("Fleet submitted! Waiting for your opponent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Shoot at an enemy cell.
  const shoot = async (cell) => {
    if (!game || game.status !== "playing" || challenge || loadingChallenge) return;

    setError("");
    setBusy(true);

    try {
      const response = await emitWithAck("shoot", {
        roomCode,
        cell,
      });

      if (response.result === "hit") {
        setSunkShipCells(response.sunk ? response.sunkShipCells || [] : []);
        setMessage(
          response.sunk
            ? "SHIP DESTROYED! You hit an entire ship."
            : "DIRECT HIT! You get another turn."
        );
      } else if (response.challengeRequired) {
        setSunkShipCells([]);
        setMessage("Missed shot! Solve the Fish API challenge to continue.");
        await loadChallenge();
      } else {
        setSunkShipCells([]);
        setMessage("MISS! The turn passes to your opponent.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Check whether it is the current player's turn.
  const myTurn =
    String(game?.currentTurn) === String(currentUserId);

  useEffect(() => {
    if (!challenge) return;

    if (secondsLeft <= 0) {
      const resolveTimeout = async () => {
        try {
          await emitWithAck("resolve-fish-challenge", {
            roomCode,
            correct: false,
          });
        } catch {
          // Ignore timeout resolution failure; the challenge is already expired.
        }
      };

      resolveTimeout();
      setChallenge(null);
      setMessage("Time expired. Mission failed.");
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [challenge, secondsLeft, roomCode]);

  const loadChallenge = async () => {
    setLoadingChallenge(true);
    setChallengeError("");
    setAnswer("");

    try {
      const response = await axios.get(`${API_URL}/fish/question`);

      setChallenge({
        id: response.data.challengeId,
        imageUrl: response.data.imageUrl,
      });

      setSecondsLeft(response.data.timeLimit || 15);
      setMessage("Missed shot! Solve the Fish API challenge to continue.");
    } catch (error) {
      setChallengeError(
        "Could not load the Fish API question. Retry to continue."
      );
    } finally {
      setLoadingChallenge(false);
    }
  };

  const submitChallenge = async (event) => {
    event.preventDefault();

    if (!challenge || checkingAnswer || secondsLeft <= 0) {
      return;
    }

    setCheckingAnswer(true);
    setChallengeError("");

    try {
      const response = await axios.post(`${API_URL}/fish/answer`, {
        challengeId: challenge.id,
        answer,
      });

      if (response.data.correct) {
        try {
          await emitWithAck("resolve-fish-challenge", {
            roomCode,
            correct: true,
          });
        } catch (serverError) {
          setError(serverError.message);
        }

        setChallenge(null);
        setAnswer("");
        setMessage("Correct answer! The battle continues.");
      } else {
        try {
          await emitWithAck("resolve-fish-challenge", {
            roomCode,
            correct: false,
          });
        } catch (serverError) {
          setError(serverError.message);
        }

        setChallenge(null);
        setAnswer("");
        setMessage("Incorrect answer. Mission failed.");
      }
    } catch (error) {
      setChallengeError(
        "Could not validate the answer. Please retry."
      );
    } finally {
      setCheckingAnswer(false);
    }
  };

  const getSunkShipCells = (fleet, shots) => {
    if (!Array.isArray(fleet) || !Array.isArray(shots)) return [];

    const hitCells = new Set(
      shots
        .filter((shot) => shot.result === "hit")
        .map((shot) => Number(shot.cell))
    );

    const sunkCells = [];

    fleet.forEach((ship) => {
      if (!Array.isArray(ship)) return;

      const normalized = ship.map((cell) => Number(cell));

      if (normalized.every((cell) => hitCells.has(cell))) {
        sunkCells.push(...normalized);
      }
    });

    return [...new Set(sunkCells)];
  };

  const getSunkShipSegments = (fleet, shots) => {
    if (!Array.isArray(fleet) || !Array.isArray(shots)) return [];

    const hitCells = new Set(
      shots
        .filter((shot) => shot.result === "hit")
        .map((shot) => Number(shot.cell))
    );

    const segments = [];

    fleet.forEach((ship) => {
      if (!Array.isArray(ship)) return;

      const normalized = ship.map((cell) => Number(cell));

      if (!normalized.every((cell) => hitCells.has(cell))) return;

      const rows = normalized.map((cell) => Math.floor(cell / game.gridSize));
      const cols = normalized.map((cell) => cell % game.gridSize);
      const isHorizontal = rows.every((row) => row === rows[0]);

      segments.push({
        cells: normalized,
        minRow: Math.min(...rows),
        minCol: Math.min(...cols),
        length: normalized.length,
        orientation: isHorizontal ? "horizontal" : "vertical",
      });
    });

    return segments;
  };

  // Render either the player's own board or the enemy board.
  const renderBoard = (type) => {
    if (!game) return null;

    const isMyBoard = type === "my";

    const myFleetCells = (game.myFleet || []).flat();
    const mySunkShipCells = new Set(
      getSunkShipCells(game.myFleet || [], game.incomingShots || [])
    );
    const enemySunkShipCells = new Set(
      (sunkShipCells || []).map((cell) => Number(cell))
    );
    const mySunkShipSegments = getSunkShipSegments(
      game.myFleet || [],
      game.incomingShots || []
    );

    const normalizedEnemySunkCells = [...new Set(
      (sunkShipCells || []).map((cell) => Number(cell))
    )].sort((a, b) => a - b);
    const enemySunkShipSegments = [];
    const visitedEnemyCells = new Set();

    for (const cell of normalizedEnemySunkCells) {
      if (visitedEnemyCells.has(cell)) continue;

      const stack = [cell];
      const group = [];
      visitedEnemyCells.add(cell);

      while (stack.length > 0) {
        const current = stack.pop();
        group.push(current);

        const row = Math.floor(current / game.gridSize);
        const col = current % game.gridSize;
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        for (const [nextRow, nextCol] of neighbors) {
          if (
            nextRow < 0 ||
            nextCol < 0 ||
            nextRow >= game.gridSize ||
            nextCol >= game.gridSize
          ) {
            continue;
          }

          const nextIndex = nextRow * game.gridSize + nextCol;

          if (!visitedEnemyCells.has(nextIndex) && enemySunkShipCells.has(nextIndex)) {
            visitedEnemyCells.add(nextIndex);
            stack.push(nextIndex);
          }
        }
      }

      if (group.length === 0) continue;

      const rows = group.map((item) => Math.floor(item / game.gridSize));
      const cols = group.map((item) => item % game.gridSize);
      const isHorizontal = rows.every((row) => row === rows[0]);

      enemySunkShipSegments.push({
        cells: [...group].sort((a, b) => a - b),
        minRow: Math.min(...rows),
        minCol: Math.min(...cols),
        length: group.length,
        orientation: isHorizontal ? "horizontal" : "vertical",
      });
    }

    const shots = isMyBoard
      ? game.incomingShots || []
      : game.outgoingShots || [];
    const sunkSegments = isMyBoard ? mySunkShipSegments : enemySunkShipSegments;

    return (
      <div
        className="battle-grid"
        style={{
          gridTemplateColumns: `repeat(${game.gridSize}, minmax(0, 1fr))`,
        }}
      >
        {Array.from(
          { length: game.gridSize * game.gridSize },
          (_, index) => {
            const shot = shots.find((item) => item.cell === index);
            const isShip = myFleetCells.includes(index);
            const isSunkShip = isMyBoard
              ? mySunkShipCells.has(index)
              : enemySunkShipCells.has(index);

            let className = "battle-cell";

            if (shot?.result === "hit") className += " hit";
            if (shot?.result === "miss") className += " miss";
            if (isMyBoard && isShip) className += " own-ship";
            if (isSunkShip) className += " sunk";

            return (
              <button
                key={index}
                type="button"
                className={className}
                disabled={
                  busy ||
                  Boolean(challenge) ||
                  loadingChallenge ||
                  Boolean(challengeError) ||
                  game.status !== "playing" ||
                  isMyBoard ||
                  !myTurn ||
                  Boolean(shot)
                }
                onClick={() => shoot(index)}
                title={
                  shot
                    ? shot.result
                    : `Row ${Math.floor(index / game.gridSize) + 1}, Column ${
                        (index % game.gridSize) + 1
                      }`
                }
              >
                {shot?.result === "hit" && !isSunkShip
                  ? "✕"
                  : shot?.result === "miss"
                    ? "•"
                    : isMyBoard && isShip && !isSunkShip
                      ? "■"
                      : ""}
              </button>
            );
          }
        )}

        {sunkSegments.map((ship, index) => (
          <div
            key={`multi-sunk-${index}`}
            className="sunk-ship"
            style={{
              left: `${(ship.minCol / game.gridSize) * 100}%`,
              top: `${(ship.minRow / game.gridSize) * 100}%`,
              width: `${(ship.orientation === "horizontal" ? ship.length : 1) * (100 / game.gridSize)}%`,
              height: `${(ship.orientation === "vertical" ? ship.length : 1) * (100 / game.gridSize)}%`,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="multiplayer-page">
      <header className="multi-header">
        <Link to="/profile" className="multi-logo">
          BATTLE <span>OCEAN</span>
        </Link>

        <Link to="/profile" className="back-link">
          Back to Profile
        </Link>
      </header>

      <main className="multi-container">

        {/* CREATE OR JOIN MENU */}
        {screen === "menu" && (
          <section className="multi-card">
            <p className="multi-eyebrow">MULTIPLAYER MODE</p>

            <h1>PLAY WITH A FRIEND</h1>

            <p className="multi-description">
              Create a private battle room or join your friend's
              game using an invitation code.
            </p>

            <label>Choose your grid size</label>

            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              disabled={busy}
            >
              <option value={8}>8 × 8</option>
              <option value={9}>9 × 9</option>
              <option value={10}>10 × 10</option>
            </select>

            <button
              className="multi-primary"
              onClick={createRoom}
              disabled={busy}
            >
              {busy ? "CREATING..." : "CREATE A GAME"}
            </button>

            <div className="multi-divider">OR</div>

            <input
              value={enteredCode}
              onChange={(e) =>
                setEnteredCode(e.target.value.toUpperCase())
              }
              placeholder="Enter your friend's room code"
              maxLength={9}
              disabled={busy}
            />

            <button
              className="multi-secondary"
              onClick={joinRoom}
              disabled={busy || !enteredCode.trim()}
            >
              {busy ? "JOINING..." : "JOIN A GAME"}
            </button>

            {error && <p className="multi-error">{error}</p>}
          </section>
        )}

        {/* ROOM LOBBY */}
        {screen === "lobby" && (
          <section className="multi-card lobby-card">
            <p className="multi-eyebrow">PRIVATE BATTLE ROOM</p>

            <h1>ROOM {roomCode}</h1>

            <div className="room-code-area">
              <span>INVITATION CODE</span>

              <strong>{roomCode}</strong>

              <button
                className="multi-secondary"
                onClick={copyCode}
              >
                {copied ? "COPIED!" : "COPY INVITATION CODE"}
              </button>
            </div>

            {/* PLAYER INFORMATION */}
            <div className="player-list">
              {game?.players?.map((player, index) => (
                <div className="player-item" key={player.username}>
                  <div>
                    <strong>
                      {index === 0 ? "PLAYER 1" : "PLAYER 2"}
                      {player.isMe ? " (YOU)" : ""}
                    </strong>

                    <p>{player.username}</p>

                    <p>
                      {player.ready ? "Fleet submitted" : "Arranging fleet"}
                    </p>
                  </div>

                  <span
                    className={
                      player.connected ? "connected" : "disconnected"
                    }
                  >
                    {player.connected ? "CONNECTED" : "DISCONNECTED"}
                  </span>
                </div>
              ))}

              {game?.players?.length === 1 && (
                <div className="player-item waiting-player">
                  <div>
                    <strong>PLAYER 2</strong>
                    <p>Waiting for opponent...</p>
                  </div>
                </div>
              )}
            </div>

            {/* SHIP PLACEMENT */}
            {game?.status === "waiting" && (
              <>
                {!myReady ? (
                  <>
                    <div className="placement-heading">
                      <h2>ARRANGE YOUR FLEET</h2>

                      <p>
                        {fleet.length < SHIPS.length
                          ? `Place ship ${fleet.length + 1} of 5 — length ${
                              SHIPS[fleet.length]
                            }`
                          : "All ships placed. Submit your fleet when ready."}
                      </p>
                    </div>

                    <div className="placement-controls">
                      <button
                        className={
                          orientation === "horizontal" ? "selected" : ""
                        }
                        onClick={() => setOrientation("horizontal")}
                      >
                        HORIZONTAL
                      </button>

                      <button
                        className={
                          orientation === "vertical" ? "selected" : ""
                        }
                        onClick={() => setOrientation("vertical")}
                      >
                        VERTICAL
                      </button>

                      <button
                        type="button"
                        onClick={() => generateRandomFleet()}
                      >
                        AUTO-PLACE
                      </button>

                      <button onClick={undoShip} disabled={fleet.length === 0}>
                        UNDO
                      </button>
                    </div>

                    <div
                      className="battle-grid placement-grid"
                      style={{
                        gridTemplateColumns: `repeat(${game.gridSize}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from(
                        { length: game.gridSize * game.gridSize },
                        (_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={
                              fleet.flat().includes(index)
                                ? "battle-cell own-ship"
                                : "battle-cell"
                            }
                            disabled={
                              busy || fleet.length === SHIPS.length
                            }
                            onClick={() => placeShip(index)}
                          />
                        )
                      )}
                    </div>

                    <button
                      className="multi-primary"
                      onClick={submitFleet}
                      disabled={
                        busy || fleet.length !== SHIPS.length
                      }
                    >
                      {busy ? "SUBMITTING..." : "READY FOR BATTLE"}
                    </button>
                  </>
                ) : (
                  <div className="placement-heading">
                    <h2>YOUR FLEET IS READY!</h2>
                    <p>
                      Waiting for your opponent to arrange and submit
                      their fleet.
                    </p>
                  </div>
                )}

                <p className="multi-description">
                  Both players must submit their fleets before the
                  battle begins.
                </p>
              </>
            )}

            {/* BATTLE SCREEN */}
            {game?.status === "playing" && (
              <>
                <h2 className="battle-status">
                  {myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
                </h2>

                <p className="multi-message">
                  {message || "Select a cell on the enemy grid to fire."}
                </p>

                {(challenge || loadingChallenge || challengeError) && (
                  <div className="fish-challenge-box">
                    <h3>FISH API CHALLENGE</h3>

                    {loadingChallenge && <p>Loading Fish API challenge...</p>}

                    {challenge && (
                      <p className="fish-timer">
                        Time left: {secondsLeft}s
                      </p>
                    )}

                    {challenge?.imageUrl && (
                      <img
                        src={challenge.imageUrl}
                        alt="Fish API puzzle"
                        className="fish-image"
                      />
                    )}

                    {challenge && (
                      <form onSubmit={submitChallenge}>
                        <input
                          type="text"
                          value={answer}
                          onChange={(event) => setAnswer(event.target.value)}
                          placeholder="Type the fish count"
                          disabled={checkingAnswer}
                        />

                        <button type="submit" disabled={checkingAnswer}>
                          {checkingAnswer ? "CHECKING..." : "SUBMIT ANSWER"}
                        </button>
                      </form>
                    )}

                    {challengeError && (
                      <>
                        <p className="multi-error">{challengeError}</p>
                        <button
                          type="button"
                          className="multi-secondary"
                          onClick={loadChallenge}
                          disabled={loadingChallenge}
                        >
                          RETRY FISH API
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="battle-boards">
                  <section>
                    <h3>YOUR FLEET</h3>
                    {renderBoard("my")}
                  </section>

                  <section>
                    <h3>ENEMY FLEET</h3>
                    {renderBoard("enemy")}
                  </section>
                </div>

                <div className="multi-stats">
                  <span>YOUR SCORE: {game.score}</span>
                  <span>HITS: {game.hits}</span>
                  <span>BOMBS LEFT: {game.remainingBombs}</span>
                </div>
              </>
            )}

            {error && <p className="multi-error">{error}</p>}
          </section>
        )}

        {/* FINISHED GAME */}
        {screen === "finished" && (
          <section className="multi-card">
            <p className="multi-eyebrow">BATTLE RESULTS</p>

            <h1>{message}</h1>

            <p className="multi-description">
              Your multiplayer battle has ended.
            </p>

            <Link to="/profile" className="multi-primary">
              RETURN TO PROFILE
            </Link>
          </section>
        )}

        {screen === "menu" && (
          <Link to="/profile" className="multi-back">
            Return to Profile
          </Link>
        )}
      </main>
    </div>
  );
}
