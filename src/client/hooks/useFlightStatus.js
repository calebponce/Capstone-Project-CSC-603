import { useState, useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL = 60000; // 1 minute

export function useFlightStatus(currentPlan, generatePlan) {
  const [flightStatus, setFlightStatus] = useState(null);
  const [replanHistory, setReplanHistory] = useState([]);
  const [pendingReplan, setPendingReplan] = useState(null);
  const lastReasonRef = useRef(null);

  useEffect(() => {
    if (!currentPlan) {
      setFlightStatus(null);
      setReplanHistory([]);
      setPendingReplan(null);
      lastReasonRef.current = null;
      return;
    }

    let cancelled = false;

    const fetchStatus = async (allowReplanSignal = false) => {
      try {
        const response = await fetch("/api/flight-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            airportCode: currentPlan.request.airportCode,
            arrivalTime: currentPlan.request.arrivalTime,
            departureTime: currentPlan.request.departureTime,
            airlineCode: currentPlan.request.airlineCode,
            flightNumber: currentPlan.request.flightNumber,
            connectionType: currentPlan.request.connectionType,
            sessionKey: currentPlan.session?.key,
          }),
        });
        if (cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) return;

        setFlightStatus(data.flight);
        setReplanHistory(data.replanHistory || []);

        if (allowReplanSignal && data.flight?.replan?.recommended) {
          const reason = data.flight.replan.reason || "Flight status changed";
          if (lastReasonRef.current !== reason) {
            lastReasonRef.current = reason;
            setPendingReplan({
              reason,
              statusLabel: data.flight.statusLabel,
              delayMinutes: data.flight.delayMinutes,
              sessionKey: data.sessionKey || currentPlan.session?.key || null,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Flight status poll failed", err);
        }
      }
    };

    fetchStatus(false);
    const timer = setInterval(() => fetchStatus(true), POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentPlan]);

  const applyPendingReplan = useCallback(() => {
    if (!pendingReplan || !currentPlan?.request) {
      setPendingReplan(null);
      return;
    }
    const selectedPoi = currentPlan?.map?.selectedPoi || null;
    generatePlan({
      ...currentPlan.request,
      sessionKey: pendingReplan.sessionKey || currentPlan.session?.key,
      trustAcknowledged: currentPlan.session?.trustAcknowledged === true,
      preferredPoiName: selectedPoi?.name || currentPlan.request?.preferredPoiName || null,
      preferredPoi: selectedPoi
        ? {
            name: selectedPoi.name,
            lat: selectedPoi.lat,
            lon: selectedPoi.lon,
            category: selectedPoi.category || null,
            address: selectedPoi.address || null,
          }
        : undefined,
    });
    setPendingReplan(null);
  }, [pendingReplan, currentPlan, generatePlan]);

  const dismissPendingReplan = useCallback(() => {
    setPendingReplan(null);
  }, []);

  return {
    flightStatus,
    replanHistory,
    pendingReplan,
    applyPendingReplan,
    dismissPendingReplan,
  };
}
