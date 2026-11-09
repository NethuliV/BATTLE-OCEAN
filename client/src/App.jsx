
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Multiplayer from "./pages/Multiplayer";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import Home from "./pages/Home";
import SoloGame from "./pages/SoloGame";

import "./App.css";

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading Battle Ocean...</div>;
  }

  return user ? <Navigate to="/home" replace /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/solo"
            element={
              <ProtectedRoute>
                <SoloGame />
              </ProtectedRoute>
            }
          />

          <Route
            path="/multiplayer"
            element={
              <ProtectedRoute>
                <Multiplayer />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
