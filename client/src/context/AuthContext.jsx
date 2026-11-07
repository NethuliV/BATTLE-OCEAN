
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import axios from "axios";

const AuthContext = createContext();

export const API_URL = import.meta.env.VITE_API_URL || "/api";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("battleOceanToken");

  // Restore login when the page is refreshed
  useEffect(() => {
    const restoreUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(
          `${API_URL}/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUser(response.data.user);
      } catch (error) {
        localStorage.removeItem("battleOceanToken");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreUser();
  }, []);

  // Register player
  const signup = async (formData) => {
    const response = await axios.post(
      `${API_URL}/auth/register`,
      formData
    );

    localStorage.setItem(
      "battleOceanToken",
      response.data.token
    );

    setUser(response.data.user);

    return response.data;
  };

  // Login player
  const login = async (formData) => {
    const response = await axios.post(
      `${API_URL}/auth/login`,
      formData
    );

    localStorage.setItem(
      "battleOceanToken",
      response.data.token
    );

    setUser(response.data.user);

    return response.data;
  };

  // Logout player
  const logout = () => {
    localStorage.removeItem("battleOceanToken");
    setUser(null);
  };

  // Refresh player profile and score
  const refreshUser = async () => {
    const currentToken = localStorage.getItem(
      "battleOceanToken"
    );

    if (!currentToken) return;

    const response = await axios.get(
      `${API_URL}/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      }
    );

    setUser(response.data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signup,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
