
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";

import SoloGame from "./SoloGame";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* Login page */}
          <Route
            path="/login"
            element={<Login />}
          />

          {/* Sign up page */}
          <Route
            path="/signup"
            element={<Signup />}
          />

          {/* Protected player profile */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Protected solo game */}
          <Route
            path="/solo"
            element={
              <ProtectedRoute>
                <SoloGame />
              </ProtectedRoute>
            }
          />

          {/* Default page */}
          <Route
            path="/"
            element={<Navigate to="/login" replace />}
          />

          {/* Unknown routes */}
          <Route
            path="*"
            element={<Navigate to="/login" replace />}
          />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
