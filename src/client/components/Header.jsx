import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Header({ onOpenVault, theme = "dark", onToggleTheme }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isLightTheme = theme === "light";

  return (
    <header className="header reveal">
      <div className="logo">
        <h1>LayoverPlus ✈️</h1>
        <p>Safe, time-bounded layover planning with AI-assisted guidance.</p>
      </div>
      
      <div className="header-actions">
        {user ? (
          <div className="user-chip card">
            <button className="vault-btn" onClick={onOpenVault} title="Open Layover Vault">
              <span className="icon">📁</span>
              <span className="mono">{user.email.split('@')[0]}</span>
            </button>
            <div className="chip-divider"></div>
            <button className="logout-icon-btn" onClick={logout} title="Sign Out">
              <span className="icon">⎋</span>
            </button>
          </div>
        ) : (
          <button className="primary-btn sm-btn" onClick={() => navigate("/auth")}>
            <span>Sign In</span>
          </button>
        )}
        
        <button
          id="theme-toggle"
          type="button"
          className="dark-toggle"
          aria-label={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
          title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
          onClick={onToggleTheme}
        >
          <span className="dark-toggle-icon" aria-hidden="true">
            {isLightTheme ? "🌙" : "☀️"}
          </span>
        </button>
      </div>
    </header>
  );
}
