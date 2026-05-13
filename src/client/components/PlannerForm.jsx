import React, { useState, useRef, useEffect } from "react";
import Select from "react-select";
import { useAuth } from "../hooks/useAuth";
import { toDatetimeLocalValue } from "../utils";

const CONNECTION_OPTIONS = [
  { id: "domestic", label: "Domestic", hint: "No customs" },
  { id: "international", label: "International", hint: "Customs adds time" },
];

const RISK_OPTIONS = [
  { id: "conservative", label: "Conservative", hint: "Play it safe" },
  { id: "balanced", label: "Balanced", hint: "A good middle" },
  { id: "explorer", label: "Explorer", hint: "Go for memorable" },
];

export default function PlannerForm({ airports, interestsConfig, generatePlan, isLoading }) {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [connectionType, setConnectionType] = useState("domestic");
  const [airportCode, setAirportCode] = useState("SFO");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [selectedInterests, setSelectedInterests] = useState(["food", "shopping"]);
  const [formError, setFormError] = useState("");
  const [isAirportMenuOpen, setIsAirportMenuOpen] = useState(false);

  const airportOptions = airports.map((a) => ({
    value: a.code,
    label: `${a.code} · ${a.name}`,
  }));

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

    const formData = new FormData(formRef.current);
    const arrVal = formData.get("arrivalTime");
    const depVal = formData.get("departureTime");
    const arrDate = new Date(arrVal);
    const depDate = new Date(depVal);

    if (Number.isNaN(arrDate.getTime()) || Number.isNaN(depDate.getTime())) {
      setFormError("Please choose a valid arrival and departure time.");
      return;
    }

    if (selectedInterests.length === 0) {
      setFormError("Pick at least one thing you're into.");
      return;
    }

    if (depDate.getTime() <= arrDate.getTime()) {
      setFormError("Your next flight has to leave after you arrive — please adjust the times.");
      return;
    }

    const layoverMinutes = (depDate.getTime() - arrDate.getTime()) / 60000;
    if (layoverMinutes < 45) {
      setFormError("Layovers under 45 minutes aren't enough for a safe off-airport plan.");
      return;
    }

    setFormError("");

    const payload = {
      airportCode,
      arrivalTime: arrVal,
      departureTime: depVal,
      connectionType,
      riskProfile,
      interests: selectedInterests,
      trustAcknowledged: formData.get("trustAcknowledged") === "on",
      saveToVault: user ? formData.get("saveToVault") === "on" : false,
    };

    generatePlan(payload);
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
      "&:hover": { borderColor: "var(--primary)" },
    }),
    menu: (base) => ({
      ...base,
      background: "var(--card-bg)",
      border: "1px solid var(--border-color)",
      borderRadius: "12px",
      overflow: "hidden",
      zIndex: 30,
    }),
    option: (base, { isFocused }) => ({
      ...base,
      background: isFocused ? "var(--bg-muted)" : "transparent",
      color: "var(--text-main)",
      cursor: "pointer",
    }),
    singleValue: (base) => ({ ...base, color: "var(--text-main)" }),
    input: (base) => ({ ...base, color: "var(--text-main)" }),
  };

  return (
    <aside className="card planner reveal">
      <form id="planner-form" className="form-card" ref={formRef} onSubmit={handleSubmit}>
        <h2 className="planner-title">Plan your layover</h2>
        <p className="planner-lead">
          A few quick details and we'll build a safe, doable plan for your time on the ground.
        </p>

        <section className="form-section">
          <span className="mini-label">Where are you stopping?</span>
          <div className="airport-select-wrap">
            <Select
              options={airportOptions}
              value={airportOptions.find((o) => o.value === airportCode)}
              onChange={(opt) => {
                setFormError("");
                setAirportCode(opt.value);
              }}
              styles={selectStyles}
              placeholder="Search airport code or name…"
              menuPlacement="bottom"
              menuPosition="absolute"
              maxMenuHeight={220}
              onMenuOpen={() => setIsAirportMenuOpen(true)}
              onMenuClose={() => setIsAirportMenuOpen(false)}
            />
            <div className={`airport-menu-spacer ${isAirportMenuOpen ? "open" : ""}`} aria-hidden="true" />
          </div>
        </section>

        <section className="form-section">
          <span className="mini-label">When?</span>
          <div className="form-row">
            <label>
              <span>Arriving</span>
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
              <span>Next flight</span>
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
        </section>

        <section className="form-section">
          <span className="mini-label">Type of connection</span>
          <div className="control-grid two-col">
            {CONNECTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`control-btn with-hint ${connectionType === opt.id ? "active" : ""}`}
                onClick={() => setConnectionType(opt.id)}
              >
                <strong>{opt.label}</strong>
                <small>{opt.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="form-section">
          <span className="mini-label">What sounds fun?</span>
          <div className="interest-grid">
            {Object.entries(interestsConfig).map(([key, cfg]) => (
              <label
                key={key}
                className={`interest-chip ${selectedInterests.includes(key) ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedInterests.includes(key)}
                  onChange={() => {
                    setFormError("");
                    setSelectedInterests((prev) =>
                      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
                    );
                  }}
                />
                <span className="chip-label">{cfg.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="form-section">
          <span className="mini-label">How adventurous?</span>
          <div className="control-grid">
            {RISK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`control-btn with-hint ${riskProfile === opt.id ? "active" : ""}`}
                onClick={() => setRiskProfile(opt.id)}
              >
                <strong>{opt.label}</strong>
                <small>{opt.hint}</small>
              </button>
            ))}
          </div>
        </section>

        {formError && <p className="form-error">{formError}</p>}

        <div className="action-row">
          <button type="submit" id="submit-btn" disabled={isLoading} className="primary-btn">
            <span>{isLoading ? "Building your plan…" : "Build my layover plan"}</span>
          </button>
        </div>

        {user ? (
          <label className="checkbox-row small">
            <input name="saveToVault" type="checkbox" defaultChecked />
            <span>Save this plan to my vault for later</span>
          </label>
        ) : (
          <p className="vault-hint mono">
            Sign in to save plans to your Layover Vault.
          </p>
        )}

        <label className="checkbox-row tiny">
          <input name="trustAcknowledged" type="checkbox" required />
          <span>I understand this is guidance only — I'll keep an eye on my own flight.</span>
        </label>
      </form>
    </aside>
  );
}
