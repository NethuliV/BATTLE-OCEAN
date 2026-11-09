
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../Auth.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(form);
      navigate("/home");
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Login failed. Check your details."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          BATTLE <span>OCEAN</span>
        </div>

        <p className="auth-eyebrow">WELCOME BACK, COMMANDER</p>

        <h1>Player Login</h1>

        <p className="auth-description">
          Sign in to continue your naval mission.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Email Address</label>

          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Enter your email"
            required
          />

          <label>Password</label>

          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Enter your password"
            required
          />

          {error && (
            <div className="auth-error">{error}</div>
          )}

          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{" "}
          <Link to="/signup">Create Account</Link>
        </p>
      </div>
    </div>
  );
}
