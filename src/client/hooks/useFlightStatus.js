import { useState, useEffect, useRef } from "react";

const POLL_INTERVAL = 60000; // 1 minute

export function useFlightStatus(currentPlan, generatePlan) {
  const [flightStatus, setFlightStatus] = useState(null);
  const [replanHistory, setReplanHistory] = useState([]);
  const lastPlanId = useRef(null);

  useEffect(() => {
    if (!currentPlan) {
      setFlightStatus(null);
      setReplanHistory([]);
      return;
    }

    const fetchStatus = async (triggerAutoReplan = false) => {
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
            sessionKey: currentPlan.session?.key
          }),
        });
        const data = await response.json();
        if (response.ok) {
          setFlightStatus(data.flight);
          setReplanHistory(data.replanHistory || []);

          if (triggerAutoReplan && data.flight?.replan?.recommended) {
            console.log("Auto-replan triggered by flight status change", data.flight.replan.reason);
            const selectedPoi = currentPlan?.map?.selectedPoi || null;
            // Trigger a re-generation with potentially updated flight times if the API returned them
            // In a real app, we'd update the formData here.
            generatePlan({
              ...currentPlan.request,
              sessionKey: data.sessionKey,
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
          }
        }
      } catch (err) {
        console.error("Flight status poll failed", err);
      }
    };

    // Initial fetch
    fetchStatus(false);

    // Start polling
    const timer = setInterval(() => fetchStatus(true), POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [currentPlan, generatePlan]);

  return { flightStatus, replanHistory };
}
