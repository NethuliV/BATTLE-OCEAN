
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "../Auth.css";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : "N/A";

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="auth-logo">
          BATTLE <span>OCEAN</span>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          LOG OUT
        </button>
      </header>

      <main className="profile-content">
        <p className="auth-eyebrow">PLAYER COMMAND CENTRE</p>

        <h1>Welcome, {user?.username}</h1>

        <p className="auth-description">
          Your player profile and battle statistics.
        </p>

        <section className="profile-card">
          <div className="avatar">
            {user?.username?.charAt(0).toUpperCase()}
          </div>

          <div>
            <h2>{user?.fullName}</h2>
            <p>@{user?.username}</p>
            <span className="player-status">
              ACTIVE PLAYER
            </span>
          </div>
        </section>

        <h2 className="section-heading">BATTLE STATISTICS</h2>

        <section className="stats-grid">
          <div className="stat-card">
            <span>TOTAL SCORE</span>
            <h2>{user?.totalScore ?? 0}</h2>
          </div>

          <div className="stat-card">
            <span>GAMES PLAYED</span>
            <h2>{user?.gamesPlayed ?? 0}</h2>
          </div>

          <div className="stat-card">
            <span>VICTORIES</span>
            <h2>{user?.wins ?? 0}</h2>
          </div>

          <div className="stat-card">
            <span>WIN RATE</span>
            <h2>
              {user?.gamesPlayed
                ? `${Math.round(
                    (user.wins / user.gamesPlayed) * 100
                  )}%`
                : "0%"}
            </h2>
          </div>
        </section>

        <h2 className="section-heading">PLAYER DETAILS</h2>

        <section className="details-card">
          <p>
            <span>Full Name</span>
            <strong>{user?.fullName}</strong>
          </p>

          <p>
            <span>Username</span>
            <strong>@{user?.username}</strong>
          </p>

          <p>
            <span>Email Address</span>
            <strong>{user?.email}</strong>
          </p>

          <p>
            <span>Joined Battle Ocean</span>
            <strong>{joinedDate}</strong>
          </p>
        </section>

        <div className="profile-actions">
          <Link to="/solo" className="auth-button">
            PLAY SOLO GAME
          </Link>
        </div>
      </main>
    </div>
  );
}
