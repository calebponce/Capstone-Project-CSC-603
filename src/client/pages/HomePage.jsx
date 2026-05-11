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
        />

        {/* --- Cinematic Hero Section --- */}
        {!currentPlan && (
          <section className="hero-section">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="eyebrow">Beyond the Terminal</span>
              <h2 className="hero-title">
                Plan your perfect <span className="text-gradient">layover</span> in seconds.
              </h2>
              <p className="hero-subtitle">
                AI-driven itineraries tailored to your time, interests, and terminal location.
              </p>
            </motion.div>
          </section>
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
