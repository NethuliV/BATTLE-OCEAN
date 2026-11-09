import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../Home.css";

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const playerName = user?.username || "Captain";
  const initials = playerName.charAt(0).toUpperCase();

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand-mark">
          BATTLE <span>OCEAN</span>
        </div>

        <nav className="home-nav">
          <Link to="/home">Home</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/solo">Solo</Link>
          <Link to="/multiplayer">Multiplayer</Link>
        </nav>

        <button className="ghost-button" onClick={handleLogout}>
          LOG OUT
        </button>
      </header>

      <main className="home-content">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">WELCOME BACK, COMMANDER</p>
            <h1>
              Command the seas,
              <span> dominate the battlefield.</span>
            </h1>

            <p className="home-description">
              Your fleet is waiting. Launch into a solo battle, challenge a friend,
              and sharpen your tactical edge across the ocean.
            </p>

            <div className="home-actions">
              <Link to="/solo" className="primary-button">
                SOLO
              </Link>
              <Link to="/multiplayer" className="secondary-button">
                FRIEND
              </Link>
            </div>
          </div>

          <div className="battle-panel">
            <div className="status-card status-card-big">
              <div className="status-row">
                <span className="status-label">PLAYER</span>
                <span className="status-dot" />
              </div>

              <div className="player-badge">
                <span>{initials}</span>
              </div>

              <div className="player-meta">
                <strong>{playerName}</strong>
                <small>Fleet Commander</small>
              </div>
            </div>

            <div className="stats-grid">
              <div className="status-card">
                <span>BEST SCORE</span>
                <strong>{user?.bestScore ?? 0}</strong>
              </div>

              <div className="status-card">
                <span>VICTORIES</span>
                <strong>{user?.wins ?? 0}</strong>
              </div>

              <div className="status-card">
                <span>GAMES</span>
                <strong>{user?.gamesPlayed ?? 0}</strong>
              </div>

              <div className="status-card">
                <span>COINS</span>
                <strong>{user?.coins ?? 0}</strong>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
