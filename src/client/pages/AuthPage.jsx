import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password);
      }
      navigate("/"); // Redirect to home on success
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-image" style={{ backgroundImage: `url('/travel_night_background_1778470083966.png')` }}></div>
      <div className="auth-overlay"></div>
      
      <div className="ambient-shape shape-a" aria-hidden="true"></div>
      <div className="ambient-shape shape-b" aria-hidden="true"></div>

      <motion.div 
        className="auth-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-branding">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            LayoverPlus ✈️
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Your cinematic guide to the world between flights.
          </motion.p>
        </div>

        <article className="card auth-card">
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.4 }}
            >
              <h2>{isLogin ? "Welcome Back" : "Start Planning"}</h2>
              <p className="mini-label">{isLogin ? "Sign in to access your vault" : "Create an account to save your itineraries"}</p>
            </motion.div>
          </AnimatePresence>
          
          <form onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="traveler@example.com" />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </label>
            
            {error && <p className="error-text">⚠️ {error}</p>}
            
            <button type="submit" disabled={isLoading} className="primary-btn">
              <span>{isLoading ? "Processing..." : (isLogin ? "Sign In" : "Sign Up")}</span>
            </button>
          </form>

          <p className="toggle-auth">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button type="button" className="text-btn" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Create Account" : "Log In"}
            </button>
          </p>
        </article>
        
        <footer className="auth-footer">
          <button className="text-btn" onClick={() => navigate("/")}>Continue as Guest →</button>
        </footer>
      </motion.div>
    </div>
  );
}
