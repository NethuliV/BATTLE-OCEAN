
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_URL, useAuth } from "../context/AuthContext";
import "./SoloGame.css";

const SHIPS = [5, 4, 3, 3, 2];
const EXTRA_BOMBS = 20;
const CHALLENGE_SECONDS = 15;

function createEmptyBoard(size) {
  return Array(size * size).fill(null);
}

function placeShips(size) {
  const board = createEmptyBoard(size);

  const isBlockedByNeighbor = (row, col) => {
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue;
        }

        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;

        if (
          nextRow < 0 ||
          nextRow >= size ||
          nextCol < 0 ||
          nextCol >= size
        ) {
          continue;
        }

        if (board[nextRow * size + nextCol] !== null) {
          return true;
        }
      }
    }

    return false;
  };

  for (const shipLength of SHIPS) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 2000) {
      attempts++;

      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);

      if (
        horizontal && col + shipLength > size
      ) {
        continue;
      }

      if (
        !horizontal && row + shipLength > size
      ) {
        continue;
      }

      const positions = [];

      for (let i = 0; i < shipLength; i++) {
        const r = row + (horizontal ? 0 : i);
        const c = col + (horizontal ? i : 0);
        positions.push(r * size + c);
      }

      const blocked = positions.some((index) => {
        const nextRow = Math.floor(index / size);
        const nextCol = index % size;
        return isBlockedByNeighbor(nextRow, nextCol);
      });

      if (blocked) {
        continue;
      }

      positions.forEach((index) => {
        board[index] = "ship";
      });

      placed = true;
    }

    if (!placed) {
      return placeShips(size);
    }
  }

  return board;
}

function createNewGame(size) {
  return {
    size,
    ships: placeShips(size),
    shots: createEmptyBoard(size),
    bombs: SHIPS.reduce((sum, length) => sum + length, 0)
      + EXTRA_BOMBS,
    score: 0,
    hits: 0,
    status: "playing",
  };
}

function getShipGroups(board, size) {
  const visited = new Set();
  const groups = [];

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== "ship" || visited.has(index)) continue;

    const queue = [index];
    const group = [];
    visited.add(index);

    while (queue.length > 0) {
      const current = queue.shift();
      group.push(current);

      const row = Math.floor(current / size);
      const col = current % size;
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
          nextRow >= size ||
          nextCol >= size
        ) {
          continue;
        }

        const nextIndex = nextRow * size + nextCol;

        if (board[nextIndex] === "ship" && !visited.has(nextIndex)) {
          visited.add(nextIndex);
          queue.push(nextIndex);
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

function getSunkShipCells(board, shots, size) {
  const sunkCells = new Set();

  getShipGroups(board, size).forEach((group) => {
    if (group.every((cell) => shots[cell] === "hit")) {
      group.forEach((cell) => sunkCells.add(cell));
    }
  });

  return sunkCells;
}

function getSunkShipSegments(board, shots, size) {
  const segments = [];

  getShipGroups(board, size).forEach((group) => {
    if (!group.every((cell) => shots[cell] === "hit")) {
      return;
    }

    const ordered = [...group].sort((a, b) => a - b);
    const rows = ordered.map((cell) => Math.floor(cell / size));
    const cols = ordered.map((cell) => cell % size);
    const isHorizontal = rows.every((row) => row === rows[0]);

    segments.push({
      cells: ordered,
      minRow: Math.min(...rows),
      minCol: Math.min(...cols),
      length: ordered.length,
      orientation: isHorizontal ? "horizontal" : "vertical",
    });
  });

  return segments;
}

export default function SoloGame() {
  const { refreshUser } = useAuth();
  const resultSavedRef = useRef(false);
  const [size, setSize] = useState(10);
  const [game, setGame] = useState(() => createNewGame(10));
  const [selectedCell, setSelectedCell] = useState(null);
  const [message, setMessage] = useState(
    "Select a square and launch your bomb."
  );

  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState("");
  const [missStreak, setMissStreak] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(
    CHALLENGE_SECONDS
  );
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [challengeError, setChallengeError] = useState("");

  const [showShips, setShowShips] = useState(false);

  function startGame(nextSize = size) {
    resultSavedRef.current = false;
    setMissStreak(0);
    setSize(nextSize);
    setGame(createNewGame(nextSize));
    setSelectedCell(null);
    setChallenge(null);
    setAnswer("");
    setChallengeError("");
    setLoadingChallenge(false);
    setCheckingAnswer(false);
    setShowShips(false);
    setMessage("Select a square and launch your bomb.");
  }

  useEffect(() => {
    if (game.status === "playing" || resultSavedRef.current) {
      return;
    }

    const saveResult = async () => {
      const token = localStorage.getItem("battleOceanToken");

      if (!token) {
        return;
      }

      try {
        await axios.post(
          `${API_URL}/profile/game-result`,
          {
            score: game.score,
            result: game.status === "won" ? "win" : "loss",
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        await refreshUser();
      } catch (error) {
        console.error("Could not save score update:", error);
      }
    };

    resultSavedRef.current = true;
    saveResult();
  }, [game.status, game.score, refreshUser]);

  useEffect(() => {
    if (!challenge || challenge.submitted) return;

    if (secondsLeft <= 0) {
      setGame((previous) => ({
        ...previous,
        status: "lost",
      }));

      setChallenge(null);
      setMessage("Time expired. Mission failed.");
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [challenge, secondsLeft]);

  async function loadChallenge() {
    setLoadingChallenge(true);
    setChallengeError("");
    setAnswer("");

    try {
      const response = await axios.get("/api/fish/question");

      setChallenge({
        id: response.data.challengeId,
        imageUrl: response.data.imageUrl,
        submitted: false,
      });

      setSecondsLeft(
        response.data.timeLimit || CHALLENGE_SECONDS
      );

      setMessage("Missed shot! Solve the Fish API challenge.");
    } catch (error) {
      setChallengeError(
        "Could not load the Fish API question. Retry to continue."
      );
    } finally {
      setLoadingChallenge(false);
    }
  }

  function shoot() {
    if (game.status !== "playing" || challenge || loadingChallenge) {
      return;
    }

    if (selectedCell === null) {
      setMessage("Please select a square first.");
      return;
    }

    if (game.shots[selectedCell] !== null) {
      setMessage("You have already bombed that square.");
      return;
    }

    if (game.bombs <= 0) {
      setGame((previous) => ({
        ...previous,
        status: "lost",
      }));
      setMessage("No bombs remaining. Mission failed.");
      return;
    }

    const isHit = game.ships[selectedCell] === "ship";

    const nextShots = [...game.shots];
    nextShots[selectedCell] = isHit ? "hit" : "miss";

    const nextHits = game.hits + (isHit ? 1 : 0);
    const nextBombs = game.bombs - 1;

    const nextGame = {
      ...game,
      shots: nextShots,
      hits: nextHits,
      bombs: nextBombs,
      score: game.score + (isHit ? 10 : 0),
    };

    if (nextHits === SHIPS.reduce((sum, n) => sum + n, 0)) {
      nextGame.status = "won";
      setGame(nextGame);
      setMessage("Victory! All enemy ships destroyed.");
      return;
    }

    if (nextBombs === 0) {
      nextGame.status = "lost";
      setGame(nextGame);
      setMessage(
        isHit
          ? "Hit confirmed, but you have no bombs left. Mission failed."
          : "No bombs remaining. Mission failed."
      );
      setMissStreak(0);
      return;
    }

    setGame(nextGame);

    if (isHit) {
      setMissStreak(0);
      setMessage("DIRECT HIT! You may shoot again.");
    } else {
      const nextMissStreak = missStreak + 1;
      setMissStreak(nextMissStreak);

      if (nextMissStreak >= 3) {
        setMessage("Three misses in a row! Solve the Fish challenge.");
        loadChallenge();
      } else {
        setMessage(`Missed shot! ${3 - nextMissStreak} more miss${3 - nextMissStreak === 1 ? "" : "es"} before the Fish challenge triggers.`);
      }
    }
  }

  async function submitAnswer(event) {
    event.preventDefault();

    if (!challenge || checkingAnswer || secondsLeft <= 0) {
      return;
    }

    setCheckingAnswer(true);
    setChallengeError("");

    try {
      const response = await axios.post("/api/fish/answer", {
        challengeId: challenge.id,
        answer,
      });

      if (response.data.correct) {
        setChallenge(null);
        setAnswer("");
        setMissStreak(0);
        setMessage("Correct answer! You may continue.");
      } else {
        setChallenge(null);
        setMissStreak(0);
        setGame((previous) => ({
          ...previous,
          status: "lost",
        }));
        setMessage("Incorrect answer. Mission failed.");
      }
    } catch (error) {
      setChallengeError(
        "Could not validate the answer. Please retry."
      );
    } finally {
      setCheckingAnswer(false);
    }
  }

  const totalShipCells = SHIPS.reduce(
    (sum, length) => sum + length,
    0
  );
  const sunkShipCells = getSunkShipCells(
    game.ships,
    game.shots,
    game.size
  );
  const sunkShipSegments = getSunkShipSegments(
    game.ships,
    game.shots,
    game.size
  );

  const gameOver = game.status !== "playing";

  return (
    <main className="solo-page">
      <header className="solo-header">
        <button
          className="text-button"
          onClick={() => startGame(size)}
        >
          BATTLE OCEAN
        </button>

        <span className="header-label">SOLO OPERATIONS</span>
      </header>

      <section className="solo-layout">
        <div className="battle-content">
          <div className="battle-heading">
            <div>
              <p className="eyebrow">MISSION CONTROL</p>
              <h1>Enemy waters</h1>
              <p className="muted">
                Find and destroy every enemy ship.
              </p>
            </div>

            <div className="grid-selector">
              <label htmlFor="grid-size">GRID SIZE</label>
              <select
                id="grid-size"
                value={size}
                disabled={Boolean(challenge)}
                onChange={(event) =>
                  startGame(Number(event.target.value))
                }
              >
                <option value={10}>10 × 10</option>
                <option value={9}>9 × 9</option>
                <option value={8}>8 × 8</option>
              </select>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span>BOMBS LEFT</span>
              <strong>{game.bombs}</strong>
            </div>

            <div className="stat-card">
              <span>DIRECT HITS</span>
              <strong>{game.hits}/{totalShipCells}</strong>
            </div>

            <div className="stat-card">
              <span>SCORE</span>
              <strong>{game.score}</strong>
            </div>
          </div>

          <div className="board-frame">
            <div
              className="game-grid"
              style={{
                gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))`,
              }}
            >
              {game.shots.map((shot, index) => {
                const row = Math.floor(index / game.size);
                const col = index % game.size;
                const isSelected = selectedCell === index;
                const isSunkShip = sunkShipCells.has(index);
                const revealShip = showShips && game.ships[index] === "ship" && shot === null;

                let cellClass = "grid-cell";

                if (shot === "hit") cellClass += " cell-hit";
                if (isSunkShip) cellClass += " cell-sunk";
                if (shot === "miss") cellClass += " cell-miss";
                if (isSelected) cellClass += " cell-selected";
                if (revealShip) cellClass += " cell-debug-ship";

                return (
                  <button
                    key={index}
                    type="button"
                    className={cellClass}
                    aria-label={`Row ${row + 1}, column ${col + 1}`}
                    disabled={
                      gameOver ||
                      Boolean(challenge) ||
                      loadingChallenge ||
                      shot !== null
                    }
                    onClick={() => setSelectedCell(index)}
                  >
                    {shot === "hit" && !isSunkShip && <span>✹</span>}
                    {shot === "miss" && <span>·</span>}
                    {shot === null && isSelected && <span>⌖</span>}
                  </button>
                );
              })}

              {sunkShipSegments.map((ship, index) => (
                <div
                  key={`solo-sunk-${index}`}
                  className="sunk-ship"
                  style={{
                    left: `${(ship.minCol / game.size) * 100}%`,
                    top: `${(ship.minRow / game.size) * 100}%`,
                    width: `${(ship.orientation === "horizontal" ? ship.length : 1) * (100 / game.size)}%`,
                    height: `${(ship.orientation === "vertical" ? ship.length : 1) * (100 / game.size)}%`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="action-row">
            <button
              className="fire-button"
              onClick={shoot}
              disabled={
                gameOver ||
                selectedCell === null ||
                Boolean(challenge) ||
                loadingChallenge
              }
            >
              {loadingChallenge ? "LOADING CHALLENGE..." : "✦ LAUNCH BOMB"}
            </button>

            <button
              className="secondary-button"
              onClick={() => startGame(size)}
            >
              RESTART
            </button>
          </div>

          <p className="game-message" aria-live="polite">
            {message}
          </p>
        </div>

        <aside className="mission-panel">
          <p className="eyebrow">MISSION STATUS</p>
          <h2>
            {game.status === "won"
              ? "MISSION COMPLETE"
              : game.status === "lost"
              ? "MISSION FAILED"
              : challenge
              ? "EMERGENCY CHECK"
              : "TARGET ACQUISITION"}
          </h2>

          <p className="muted">
            {game.status === "won"
              ? "Every enemy ship has been destroyed."
              : game.status === "lost"
              ? "Your mission has ended. Try again."
              : challenge
              ? "Solve the puzzle before the countdown expires."
              : "Select a cell on the tactical grid to target enemy ships."}
          </p>

          {challenge && (
            <div className="challenge-box">
              <div className="challenge-title">
                <span>FISH API CHALLENGE</span>
                <strong>{secondsLeft}s</strong>
              </div>

              {challenge.imageUrl && (
                <img
                  className="fish-question"
                  src={challenge.imageUrl}
                  alt="Fish API puzzle"
                />
              )}

              <form onSubmit={submitAnswer}>
                <label htmlFor="fish-answer">
                  YOUR ANSWER
                </label>

                <input
                  id="fish-answer"
                  type="text"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Enter the answer"
                  autoComplete="off"
                  required
                />

                <button
                  className="fire-button"
                  type="submit"
                  disabled={checkingAnswer || secondsLeft <= 0}
                >
                  {checkingAnswer ? "CHECKING..." : "SUBMIT ANSWER"}
                </button>
              </form>

              {challengeError && (
                <div className="error-message">
                  {challengeError}
                </div>
              )}
            </div>
          )}

          {loadingChallenge && (
            <p className="muted">Contacting Fish API...</p>
          )}

          {challengeError && !challenge && (
            <div className="challenge-box">
              <p className="error-message">{challengeError}</p>
              <button
                className="fire-button"
                onClick={loadChallenge}
              >
                RETRY CHALLENGE
              </button>
            </div>
          )}

          {gameOver && (
            <button
              className="fire-button"
              onClick={() => startGame(size)}
            >
              PLAY AGAIN
            </button>
          )}

          <div className="legend">
            <div><span className="legend-dot dot-sunk" /> Sunk ship</div>
            <div><span className="legend-dot dot-hit" /> Hit ship</div>
            <div><span className="legend-dot dot-miss" /> Water / missed shot</div>
            <div><span className="legend-dot dot-selected" /> Selected target</div>
          </div>

          <button
            className="text-button reveal-button"
            onClick={() => setShowShips((previous) => !previous)}
          >
            {showShips ? "HIDE DEBUG SHIPS" : "SHOW DEBUG SHIPS"}
          </button>

          {showShips && (
            <div className="debug-note">
              Development only: ship locations are hidden from the normal
              game board. Use your browser console only for development
              checks; remove this debug option before release.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
