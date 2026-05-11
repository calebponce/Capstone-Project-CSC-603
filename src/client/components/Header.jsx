import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Header({
  onOpenVault,
  theme = "dark",
  onToggleTheme,
  onGoHome,
  showHomeAction = false,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isLightTheme = theme === "light";
  const handleGoHome = () => {
    if (typeof onGoHome === "function") {
      onGoHome();
      return;
    }
    navigate("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="header reveal">
      <button type="button" className="logo-button" onClick={handleGoHome}>
        <div className="logo">
          <h1>LayoverPlus ✈️</h1>
          <p>Risk-aware layover intelligence for travel platforms and premium traveler products.</p>
        </div>
      </button>
      
      <div className="header-actions">
        {showHomeAction && (
          <button type="button" className="secondary-action sm-btn header-home-btn" onClick={handleGoHome}>
            <span>Home</span>
          </button>
        )}
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
