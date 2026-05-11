import React, { useEffect, useRef } from "react";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function Map({
  currentPlan,
  highlightCandidate = null,
  highlightCandidateName = null,
  compact = false,
  invalidateTrigger = null,
}) {
  const renderedFocusCandidate =
    highlightCandidate?.name || highlightCandidateName || currentPlan?.map?.selectedPoi?.name || "";
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    // Initialize map on first render
    if (!mapInstanceRef.current && mapRef.current && window.L) {
      mapInstanceRef.current = window.L.map(mapRef.current, { zoomControl: false }).setView([39.5, -98.35], 4);
      
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapInstanceRef.current);

      layerGroupRef.current = window.L.layerGroup().addTo(mapInstanceRef.current);
      window.L.control.zoom({ position: "bottomright" }).addTo(mapInstanceRef.current);
    }

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.ResizeObserver) {
      return undefined;
    }
    const observedElement = mapRef.current.parentElement || mapRef.current;
    resizeObserverRef.current = new window.ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserverRef.current.observe(observedElement);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // Update map when currentPlan changes
  useEffect(() => {
    if (mapInstanceRef.current && layerGroupRef.current && currentPlan && currentPlan.map && window.L) {
      const { airport, candidates, selectedPoi } = currentPlan.map;
      const L = window.L;
      const highlightedByCoordinates =
        Number.isFinite(highlightCandidate?.lat) && Number.isFinite(highlightCandidate?.lon)
          ? (candidates || []).find(
              (candidate) =>
                Math.abs(candidate.lat - highlightCandidate.lat) <= 0.0005 &&
                Math.abs(candidate.lon - highlightCandidate.lon) <= 0.0005
            ) || null
          : null;
      const highlightedByName = (candidates || []).find(
        (candidate) =>
          normalizeName(candidate.name) ===
          normalizeName(highlightCandidate?.name || highlightCandidateName)
      );
      const focusPoi =
        highlightedByCoordinates ||
        highlightedByName ||
        (highlightCandidate &&
        Number.isFinite(highlightCandidate.lat) &&
        Number.isFinite(highlightCandidate.lon)
          ? highlightCandidate
          : null) ||
        selectedPoi ||
        null;
      
      layerGroupRef.current.clearLayers();
      const points = [];

      // Airport Marker
      if (airport) {
        L.marker([airport.lat, airport.lon])
          .bindPopup(`<strong>${airport.code || "AIRPORT"}</strong><br />${airport.name}`)
          .addTo(layerGroupRef.current);
        points.push([airport.lat, airport.lon]);
      }

      // Candidate Markers
      (candidates || []).forEach(cand => {
        const isFocused = cand.name === focusPoi?.name;
        const marker = L.circleMarker([cand.lat, cand.lon], {
          radius: isFocused ? 9 : 7,
          color: cand.riskLabel === "Low" ? "#166534" : cand.riskLabel === "Medium" ? "#a16207" : "#b91c1c",
          fillColor: isFocused ? "#14b8a6" : undefined,
          weight: isFocused ? 2.5 : 1.5,
          fillOpacity: isFocused ? 0.95 : 0.8
        }).bindPopup(
          `<strong>${cand.name}</strong><br />Score: ${cand.score || 0}/100<br />Risk: ${
            cand.riskLabel || "Unknown"
          }`
        );
        marker.addTo(layerGroupRef.current);
        points.push([cand.lat, cand.lon]);
      });

      const selectedMissingFromList =
        focusPoi &&
        !(candidates || []).some((candidate) =>
          (normalizeName(candidate?.name) === normalizeName(focusPoi?.name) &&
            Math.abs(candidate.lat - focusPoi.lat) <= 0.0005 &&
            Math.abs(candidate.lon - focusPoi.lon) <= 0.0005) ||
          (Math.abs(candidate.lat - focusPoi.lat) <= 0.0005 &&
            Math.abs(candidate.lon - focusPoi.lon) <= 0.0005)
        );
      if (selectedMissingFromList) {
        L.circleMarker([focusPoi.lat, focusPoi.lon], {
          radius: 9,
          color: "#14b8a6",
          fillColor: "#2dd4bf",
          weight: 2.5,
          fillOpacity: 0.95,
        })
          .bindPopup(
            `<strong>${focusPoi.name}</strong><br />Selected destination`
          )
          .addTo(layerGroupRef.current);
        points.push([focusPoi.lat, focusPoi.lon]);
      }

      // Selected POI Route
      if (focusPoi && airport) {
        L.polyline([[airport.lat, airport.lon], [focusPoi.lat, focusPoi.lon]], {
          color: "#146b61",
          weight: 4,
          dashArray: "10 7"
        }).addTo(layerGroupRef.current);
      }

      const routePoints = [];
      if (airport) {
        routePoints.push([airport.lat, airport.lon]);
      }
      if (focusPoi) {
        routePoints.push([focusPoi.lat, focusPoi.lon]);
      }

      if (routePoints.length >= 2) {
        mapInstanceRef.current.fitBounds(routePoints, { padding: [56, 56], maxZoom: 12 });
      } else if (points.length > 0) {
        mapInstanceRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
      }

      // Ensure Leaflet recalculates dimensions after layout changes (tabs/cards).
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 60);
    }
  }, [currentPlan, highlightCandidate, highlightCandidateName, compact, invalidateTrigger]);

  return (
    <div
      className="map-container"
      data-focus-candidate={renderedFocusCandidate}
      style={{
        height: compact ? "320px" : "400px",
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div className="map-canvas" ref={mapRef} style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
}
