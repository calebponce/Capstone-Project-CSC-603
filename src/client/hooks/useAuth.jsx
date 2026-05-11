import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("layoverToken");
    const email = localStorage.getItem("layoverEmail");
    if (token && email) {
      setUser({ email, token });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem("layoverToken", data.token);
    localStorage.setItem("layoverEmail", data.email);
    setUser({ email: data.email, token: data.token });
  };

  const signup = async (email, password) => {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem("layoverToken", data.token);
    localStorage.setItem("layoverEmail", data.email);
    setUser({ email: data.email, token: data.token });
  };

  const logout = () => {
    localStorage.removeItem("layoverToken");
    localStorage.removeItem("layoverEmail");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
