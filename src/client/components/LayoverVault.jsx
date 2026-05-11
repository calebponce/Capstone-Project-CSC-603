import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { formatDateTime } from "../utils";

export default function LayoverVault({ isOpen, onClose, onRestore }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchVault();
    }
  }, [isOpen, user]);

  const fetchVault = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/vault", {
        headers: { "Authorization": `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (res.ok) setPlans(data.savedPlans || []);
    } catch (err) {
      console.error("Failed to fetch vault", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div 
        className="modal-content vault-modal"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="vault-header">
          <h2>Layover Vault</h2>
          <p className="mini-label">Your persistent itineraries</p>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="vault-body">
          {isLoading ? (
            <p className="loading-text">Loading your plans...</p>
          ) : plans.length === 0 ? (
            <div className="empty-vault">
              <p>Your vault is empty.</p>
              <span>Save plans from the main screen to see them here.</span>
            </div>
          ) : (
            <div className="vault-grid">
              {plans.map(p => (
                <div key={p.id} className="vault-item card" onClick={() => { onRestore(p.plan); onClose(); }}>
                  <div className="vault-item-info">
                    <strong>{p.title}</strong>
                    <span>{p.airportCode} · {formatDateTime(p.generatedAt)}</span>
                  </div>
                  <button className="restore-btn">Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
