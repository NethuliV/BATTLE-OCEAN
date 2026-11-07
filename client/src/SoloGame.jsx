
import { useEffect, useState } from "react";
import axios from "axios";
import "./SoloGame.css";

const SHIPS = [5, 4, 3, 3, 2];
const EXTRA_BOMBS = 5;
const CHALLENGE_SECONDS = 15;

function createEmptyBoard(size) {
  return Array(size * size).fill(null);
}

function placeShips(size) {
  const board = createEmptyBoard(size);

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

      if (positions.some((index) => board[index] !== null)) {
        continue;
      }

      positions.forEach((index) => {
        board[index] = "ship";
      });

      placed = true;
    }

    if (!placed) {
      // Retry with a fresh board if placement fails.
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

export default function SoloGame() {
  const [size, setSize] = useState(10);
  const [game, setGame] = useState(() => createNewGame(10));
  const [selectedCell, setSelectedCell] = useState(null);
  const [message, setMessage] = useState(
    "Select a square and launch your bomb."
  );

  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(
    CHALLENGE_SECONDS
  );
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [challengeError, setChallengeError] = useState("");

  const [showShips, setShowShips] = useState(false);

  function startGame(nextSize = size) {
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
      return;
    }

    setGame(nextGame);

    if (isHit) {
      setMessage("DIRECT HIT! You may shoot again.");
    } else {
      loadChallenge();
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
        setMessage("Correct answer! You may continue.");
      } else {
        setChallenge(null);
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
                disabled={!gameOver || Boolean(challenge)}
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

                let cellClass = "grid-cell";

                if (shot === "hit") cellClass += " cell-hit";
                if (shot === "miss") cellClass += " cell-miss";
                if (isSelected) cellClass += " cell-selected";

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
                    {shot === "hit" && <span>✹</span>}
                    {shot === "miss" && <span>·</span>}
                    {shot === null && isSelected && <span>⌖</span>}
                  </button>
                );
              })}
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
            <div><span className="legend-dot dot-hit" /> Ship destroyed</div>
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
