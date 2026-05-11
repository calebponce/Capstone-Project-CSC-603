import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PlannerForm from "../components/PlannerForm";
import ResultsArea from "../components/ResultsArea";
import LayoverVault from "../components/LayoverVault";
import { useFlightStatus } from "../hooks/useFlightStatus";
import { useAuth } from "../hooks/useAuth";

function normalizeCandidateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function HomePage({ theme, onToggleTheme }) {
  const { user } = useAuth();
  const [airports, setAirports] = useState([]);
  const [interestsConfig, setInterestsConfig] = useState({});
  const [currentPlan, setCurrentPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [pendingCandidateName, setPendingCandidateName] = useState(null);
  const [activeCandidateName, setActiveCandidateName] = useState(null);
  const latestRequestIdRef = useRef(0);
  const activePlanRequestRef = useRef(null);

  useEffect(() => {
    let rafId;
    const handleMouseMove = (e) => {
      rafId = requestAnimationFrame(() => {
        const glow = document.getElementById("cursor-glow");
        if (glow) {
          glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        }
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (response.ok) {
          const data = await response.json();
          setAirports(data.airports || []);
          setInterestsConfig(data.interests || {});
        }
      } catch (err) {
        console.error("Failed to load config", err);
      }
    }
    loadConfig();
  }, []);

  const emitClientEvent = useCallback(async (eventType, details = {}, stage = null) => {
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          stage,
          sessionKey: details?.sessionKey || null,
          details,
        }),
      });
    } catch (_err) {
      // Non-blocking telemetry.
    }
  }, []);

  const generatePlan = useCallback(async (formData) => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const startedAt = Date.now();
    const trustAcknowledged =
      formData?.trustAcknowledged === true ||
      formData?.trustAcknowledged === "true" ||
      formData?.trustAcknowledged === "on" ||
      Boolean(formData?.sessionKey);
    const payload = {
      ...formData,
      trustAcknowledged,
    };
    const preferredPoiName = payload?.preferredPoiName || null;
    setPendingCandidateName(preferredPoiName);
    if (!preferredPoiName) {
      setActiveCandidateName(null);
    }

    if (activePlanRequestRef.current) {
      activePlanRequestRef.current.abort();
      activePlanRequestRef.current = null;
    }
    const requestController = new AbortController();
    activePlanRequestRef.current = requestController;

    setIsLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json" };
      if (user?.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }
      const response = await fetch("/api/plan", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: requestController.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate plan");
      }
      if (latestRequestIdRef.current === requestId) {
        setCurrentPlan(data);
        const selectedPoiName = data?.map?.selectedPoi?.name || null;
        const preferredMatched = data?.selection?.preferredMatchFound !== false;
        if (preferredPoiName) {
          const matchedCandidate = (data?.map?.candidates || []).find(
            (candidate) =>
              normalizeCandidateName(candidate?.name) ===
              normalizeCandidateName(preferredPoiName)
          );
          setActiveCandidateName(
            matchedCandidate?.name || selectedPoiName || null
          );
        } else {
          setActiveCandidateName(selectedPoiName);
        }
        if (preferredPoiName && (!preferredMatched || !selectedPoiName)) {
          emitClientEvent("selection_mismatch", {
            requestedPoiName: preferredPoiName,
            selectedPoiName,
            preferredMatchFound: data?.selection?.preferredMatchFound,
            selectedBy: data?.selection?.selectedBy,
            sessionKey: data?.session?.key || payload?.sessionKey || null,
            clientLatencyMs: Date.now() - startedAt,
          }, "plan-response");
        }
        setPendingCandidateName(null);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      if (latestRequestIdRef.current === requestId) {
        setError(err.message);
        emitClientEvent("plan_request_failed", {
          message: err.message,
          requestedPoiName: preferredPoiName,
          sessionKey: payload?.sessionKey || null,
          clientLatencyMs: Date.now() - startedAt,
        }, "plan-request");
        setPendingCandidateName(null);
      }
    } finally {
      if (activePlanRequestRef.current === requestController) {
        activePlanRequestRef.current = null;
      }
      if (latestRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [emitClientEvent, user]);

  const selectAlternative = useCallback((candidate) => {
    if (!candidate?.name || !currentPlan?.request) {
      return;
    }
    setActiveCandidateName(candidate.name);

    generatePlan({
      ...currentPlan.request,
      sessionKey: currentPlan.session?.key,
      trustAcknowledged: currentPlan.session?.trustAcknowledged === true,
      preferredPoiName: candidate.name,
      preferredPoi: {
        name: candidate.name,
        lat: candidate.lat,
        lon: candidate.lon,
        category: candidate.category || null,
      },
    });
  }, [currentPlan, generatePlan]);

  const restorePlan = (plan) => {
    setCurrentPlan(plan);
    setPendingCandidateName(null);
    setActiveCandidateName(plan?.map?.selectedPoi?.name || null);
  };

  const resetToHomepage = useCallback(() => {
    if (activePlanRequestRef.current) {
      activePlanRequestRef.current.abort();
      activePlanRequestRef.current = null;
    }
    setCurrentPlan(null);
    setPendingCandidateName(null);
    setActiveCandidateName(null);
    setError(null);
    setIsLoading(false);
    setIsVaultOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const { flightStatus, replanHistory } = useFlightStatus(currentPlan, generatePlan);

  return (
    <>
      <div className="ambient-shape shape-a" aria-hidden="true"></div>
      <div className="ambient-shape shape-b" aria-hidden="true"></div>
      <div className="cursor-glow" id="cursor-glow"></div>

      <motion.main 
        className="page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <Header
          onOpenVault={() => setIsVaultOpen(true)}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onGoHome={resetToHomepage}
          showHomeAction={Boolean(currentPlan)}
        />

        {/* --- Cinematic Hero Section --- */}
        {!currentPlan && (
          <section className="hero-section">
            <motion.div
              className="hero-shell"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="hero-copy">
                <span className="eyebrow">Layover Decisioning Infrastructure</span>
                <div className="hero-kicker-row">
                  <span className="hero-kicker-pill">For loyalty, concierge, and travel platform teams</span>
                  <span className="hero-kicker-note">Explainable off-airport guidance with traveler-facing output</span>
                </div>
                <h2 className="hero-title">
                  Ship safer layover recommendations without building the <span className="text-gradient">ops layer</span> yourself.
                </h2>
                <p className="hero-subtitle">
                  LayoverPlus turns a layover window into a scored stop recommendation, synced timeline,
                  live route map, and place preview that a partner can actually launch.
                </p>
                <p className="hero-support-copy">
                  Use the planner to simulate a real traveler window and inspect the exact product surface
                  your customer, concierge agent, or loyalty app would present.
                </p>
                <div className="hero-actions-row">
                  <a href="#planner-form" className="primary-btn hero-cta">
                    Generate live itinerary
                  </a>
                  <div className="hero-inline-proof">
                    <span className="hero-proof-pill">Explainable scoring</span>
                    <span className="hero-proof-pill">White-label ready</span>
                    <span className="hero-proof-pill">Map + preview sync</span>
                  </div>
                </div>
                <div className="hero-stat-grid">
                  <article className="hero-stat-card">
                    <strong>Scored decisioning</strong>
                    <span>Evaluates feasibility, travel margin, dwell value, and return safety in one flow.</span>
                  </article>
                  <article className="hero-stat-card">
                    <strong>Synced user surface</strong>
                    <span>Timeline, map, and place context stay aligned when a traveler changes stops.</span>
                  </article>
                  <article className="hero-stat-card">
                    <strong>Partner deployment path</strong>
                    <span>Fits loyalty apps, premium travel portals, concierge desks, and embedded APIs.</span>
                  </article>
                </div>
              </div>

              <div className="hero-proof-panel">
                <p className="mini-label">Launch Surface Audit</p>
                <div className="hero-proof-grid">
                  <div className="hero-proof-card hero-proof-card-feature">
                    <strong>What a buyer can demo immediately</strong>
                    <ul className="hero-proof-list">
                      <li>Safer alternatives ranked with explicit risk tradeoffs.</li>
                      <li>Traveler-facing decision, timeline, map, and place preview in one flow.</li>
                      <li>Fallback-safe guidance when off-airport travel should be avoided.</li>
                    </ul>
                  </div>
                  <div className="hero-proof-card">
                    <strong>Best first buyers</strong>
                    <span>Premium travel portals, concierge teams, and OTA products with layover engagement goals.</span>
                  </div>
                  <div className="hero-proof-card">
                    <strong>What still needs hardening</strong>
                    <span>Operational observability, partner configuration, and production-grade data guarantees.</span>
                  </div>
                </div>
                <div className="hero-proof-footer">
                  <span className="hero-proof-flag">Explainable decisions</span>
                  <span className="hero-proof-flag">Traveler-facing preview</span>
                  <span className="hero-proof-flag">Partner packaging path</span>
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {error && (
          <motion.section
            className="status-banner error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <p className="status-banner-title">Plan Request Failed</p>
            <p className="status-banner-copy">{error}</p>
          </motion.section>
        )}

        <section className={`workspace ${currentPlan ? 'has-results' : ''}`}>
          <motion.div
            className="planner-container"
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            <PlannerForm 
              airports={airports} 
              interestsConfig={interestsConfig}
              generatePlan={generatePlan} 
              isLoading={isLoading} 
            />
          </motion.div>
          
          <ResultsArea 
            currentPlan={currentPlan} 
            isLoading={isLoading} 
            flightStatus={flightStatus}
            replanHistory={replanHistory}
            pendingCandidateName={pendingCandidateName}
            activeCandidateName={activeCandidateName}
            onSelectCandidate={selectAlternative}
          />
        </section>

        <Footer />
      </motion.main>

      <AnimatePresence>
        {isVaultOpen && (
          <LayoverVault 
            isOpen={isVaultOpen} 
            onClose={() => setIsVaultOpen(false)} 
            onRestore={restorePlan} 
          />
        )}
      </AnimatePresence>

      {error && (
        <div className="error-toast card reveal">
          <p>⚠️ {error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </>
  );
}
