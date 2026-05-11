import React, { useState, useRef, useEffect } from "react";
import Select from "react-select";
import { useAuth } from "../hooks/useAuth";
import { normalizeAirlineCode, normalizeFlightNumber, toDatetimeLocalValue } from "../utils";

const SCENARIOS = {
  "food-sfo": {
    airportCode: "SFO",
    connectionType: "domestic",
    hoursAhead: 5,
    riskProfile: "balanced",
    strategyPack: "food-first",
    interests: ["food", "shopping"],
  },
  "culture-jfk": {
    airportCode: "JFK",
    connectionType: "domestic",
    hoursAhead: 6,
    riskProfile: "balanced",
    strategyPack: "culture-deep",
    interests: ["culture", "sightseeing"],
  },
  "scenic-lax": {
    airportCode: "LAX",
    connectionType: "international",
    hoursAhead: 8,
    riskProfile: "conservative",
    strategyPack: "standard",
    interests: ["sightseeing", "food"],
  },
};

const SCENARIO_PRESENTATION = {
  "food-sfo": {
    icon: "🍜",
    title: "Food Sprint",
    summary: "Best for quick local dining and short-transfer confidence.",
  },
  "culture-jfk": {
    icon: "🏛️",
    title: "Culture Stop",
    summary: "Best for a focused museum or landmark experience.",
  },
  "scenic-lax": {
    icon: "🌊",
    title: "Scenic Window",
    summary: "Best for long windows with conservative safety buffers.",
  },
};

const STRATEGIES = [
  { id: "standard", label: "Standard", desc: "Balanced mix of transit and exploration." },
  { id: "food-first", label: "Food First", desc: "Prioritizes high-rated local dining." },
  { id: "culture-deep", label: "Culture Deep Dive", desc: "Focuses on museums and landmarks." },
  { id: "recharge", label: "Recharge Nearby", desc: "Low-stress options close to terminal." },
];

const CONNECTION_OPTIONS = [
  { id: "domestic", label: "Domestic" },
  { id: "international", label: "International" },
];

const RISK_OPTIONS = [
  { id: "conservative", label: "Conservative" },
  { id: "balanced", label: "Balanced" },
  { id: "explorer", label: "Explorer" },
];

export default function PlannerForm({ airports, interestsConfig, generatePlan, isLoading }) {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [strategyPack, setStrategyPack] = useState("standard");
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [connectionType, setConnectionType] = useState("domestic");
  const [airportCode, setAirportCode] = useState("SFO");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [selectedInterests, setSelectedInterests] = useState(["food", "shopping"]);
  const [formError, setFormError] = useState("");
  const [isAirportMenuOpen, setIsAirportMenuOpen] = useState(false);

  const airportOptions = airports.map(a => ({
    value: a.code,
    label: `${a.code} · ${a.name}`
  }));

  const selectedScenarioKey =
    Object.entries(SCENARIOS).find(([, scenario]) => {
      const sameInterests =
        scenario.interests.length === selectedInterests.length &&
        scenario.interests.every((interest, index) => interest === selectedInterests[index]);

      return (
        scenario.airportCode === airportCode &&
        scenario.connectionType === connectionType &&
        scenario.riskProfile === riskProfile &&
        scenario.strategyPack === strategyPack &&
        sameInterests
      );
    })?.[0] || null;

  useEffect(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    const remainder = now.getMinutes() % 15;
    if (remainder !== 0) {
      now.setMinutes(now.getMinutes() + (15 - remainder));
    }
    setArrivalTime(toDatetimeLocalValue(now));

    const later = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    setDepartureTime(toDatetimeLocalValue(later));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formRef.current) return;
    setFormError("");

    const formData = new FormData(formRef.current);
    const arrVal = formData.get("arrivalTime");
    const depVal = formData.get("departureTime");
    const arrDate = new Date(arrVal);
    const depDate = new Date(depVal);

    if (depDate.getTime() <= arrDate.getTime()) {
      setFormError("Departure time must be later than arrival time.");
      return;
    }

    if (selectedInterests.length === 0) {
      setFormError("Select at least one interest so the itinerary can be personalized.");
      return;
    }

    const payload = {
      airportCode: airportCode,
      arrivalTime: arrVal,
      departureTime: depVal,
      connectionType: connectionType,
      riskProfile: riskProfile,
      strategyPack: strategyPack,
      interests: selectedInterests,
      airlineCode: normalizeAirlineCode(formData.get("airlineCode")),
      flightNumber: normalizeFlightNumber(formData.get("flightNumber")),
      trustAcknowledged: formData.get("trustAcknowledged") === "on",
      saveToVault: user ? formData.get("saveToVault") === "on" : false,
    };

    generatePlan(payload);
  };

  const applyScenario = (key) => {
    const sc = SCENARIOS[key];
    if (!sc) return;
    setFormError("");
    setAirportCode(sc.airportCode);
    setConnectionType(sc.connectionType);
    setRiskProfile(sc.riskProfile);
    setStrategyPack(sc.strategyPack);
    setSelectedInterests(sc.interests);
    
    const arrDate = new Date(arrivalTime || Date.now());
    const later = new Date(arrDate.getTime() + sc.hoursAhead * 60 * 60 * 1000);
    setDepartureTime(toDatetimeLocalValue(later));
  };

  const selectStyles = {
    control: (base) => ({
      ...base,
      background: "var(--input-bg)",
      borderColor: "var(--border-color)",
      color: "var(--text-main)",
      borderRadius: "12px",
      padding: "2px 4px",
      boxShadow: "none",
      "&:hover": { borderColor: "var(--primary)" }
    }),
    menu: (base) => ({
      ...base,
      background: "var(--card-bg)",
      border: "1px solid var(--border-color)",
      borderRadius: "12px",
      overflow: "hidden",
      zIndex: 30
    }),
    option: (base, { isFocused }) => ({
      ...base,
      background: isFocused ? "var(--bg-muted)" : "transparent",
      color: "var(--text-main)",
      cursor: "pointer"
    }),
    singleValue: (base) => ({ ...base, color: "var(--text-main)" }),
    input: (base) => ({ ...base, color: "var(--text-main)" })
  };

  return (
    <aside className="card planner reveal">
      <form id="planner-form" className="form-card" ref={formRef} onSubmit={handleSubmit}>
        <p className="eyebrow">Planner</p>
        <h2>Build an itinerary</h2>
        
        <section className="quick-start-block">
          <p className="mini-label">Quick Start Options</p>
          <div className="scenario-grid">
            {Object.keys(SCENARIOS).map((key) => (
              <button
                key={key}
                type="button"
                className={`scenario-btn ${selectedScenarioKey === key ? "active" : ""}`}
                onClick={() => applyScenario(key)}
              >
                <strong>
                  {SCENARIO_PRESENTATION[key]?.icon} {SCENARIO_PRESENTATION[key]?.title}
                </strong>
                <span>{SCENARIO_PRESENTATION[key]?.summary}</span>
                <em>{SCENARIOS[key].airportCode} · +{SCENARIOS[key].hoursAhead}h</em>
              </button>
            ))}
          </div>
        </section>

        <section className="form-section compact">
          <span className="mini-label">Connection Type</span>
          <div className="control-grid two-col">
            {CONNECTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`control-btn ${connectionType === opt.id ? "active" : ""}`}
                onClick={() => setConnectionType(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="form-section compact">
          <span className="mini-label">Risk Profile</span>
          <div className="control-grid">
            {RISK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`control-btn ${riskProfile === opt.id ? "active" : ""}`}
                onClick={() => setRiskProfile(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <label>
          <span>Arrival airport</span>
          <div className="airport-select-wrap">
            <Select 
              options={airportOptions}
              value={airportOptions.find(o => o.value === airportCode)}
              onChange={(opt) => {
                setFormError("");
                setAirportCode(opt.value);
              }}
              styles={selectStyles}
              placeholder="Search airport code or name..."
              menuPlacement="bottom"
              menuPosition="absolute"
              maxMenuHeight={220}
              onMenuOpen={() => setIsAirportMenuOpen(true)}
              onMenuClose={() => setIsAirportMenuOpen(false)}
            />
            <div className={`airport-menu-spacer ${isAirportMenuOpen ? "open" : ""}`} aria-hidden="true" />
          </div>
        </label>

        <div className="form-row">
          <label>
            <span>Arrival time</span>
            <input
              name="arrivalTime"
              type="datetime-local"
              required
              value={arrivalTime}
              onChange={(e) => {
                setFormError("");
                setArrivalTime(e.target.value);
              }}
            />
          </label>
          <label>
            <span>Departure</span>
            <input
              name="departureTime"
              type="datetime-local"
              required
              value={departureTime}
              onChange={(e) => {
                setFormError("");
                setDepartureTime(e.target.value);
              }}
            />
          </label>
        </div>

        <details className="accordion">
          <summary className="accordion-trigger">Flight details & Personalization</summary>
          <div className="accordion-body">
            <div className="form-row">
              <label>
                <span>Airline</span>
                <input name="airlineCode" type="text" maxLength="3" placeholder="AA" />
              </label>
              <label>
                <span>Flight #</span>
                <input name="flightNumber" type="text" maxLength="6" placeholder="1234" />
              </label>
            </div>
            
            <label>
              <span>Strategy & Personality</span>
              <div className="pack-grid mini">
                {STRATEGIES.map(p => (
                  <button key={p.id} type="button" className={`pack-btn ${strategyPack === p.id ? 'active' : ''}`} onClick={() => setStrategyPack(p.id)}>
                    <strong>{p.label}</strong>
                  </button>
                ))}
              </div>
            </label>

            {/* Interests Section */}
            <div className="form-section">
              <span className="mini-label">Personalize Your Journey</span>
              <div className="interest-grid">
                {Object.entries(interestsConfig).map(([key, cfg]) => (
                  <label key={key} className={`interest-chip ${selectedInterests.includes(key) ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedInterests.includes(key)}
                      onChange={() => {
                        setFormError("");
                        setSelectedInterests(prev => prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]);
                      }}
                    />
                    <span className="chip-label">{cfg.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </details>

        {user && (
          <label className="checkbox-row premium-feature">
            <input name="saveToVault" type="checkbox" defaultChecked />
            <span>💾 Save this plan to my Layover Vault</span>
          </label>
        )}

        {formError && <p className="form-error">{formError}</p>}

        <div className="action-row">
          <button type="submit" id="submit-btn" disabled={isLoading} className="primary-btn">
            <span>{isLoading ? "Generating..." : "Generate layover plan"}</span>
          </button>
        </div>
        
        <label className="checkbox-row small">
          <input name="trustAcknowledged" type="checkbox" required />
          <span>I understand this tool gives guidance only.</span>
        </label>
      </form>
    </aside>
  );
}
