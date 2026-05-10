# ✈️ LayoverPlus

**Risk-Aware AI Micro-Itineraries for Airport Layovers**
Turn your layover into a safe, time-bounded mini adventure.

---

## 👥 Team

| Name                         | Role          | Email                                                       |
| ---------------------------- | ------------- | ----------------------------------------------------------- |
| Caleb Ponce                  | AI & Backend  | [cponce8@sfsu.edu](mailto:cponce8@sfsu.edu)                 |
| Edson Sanchez Bernal         | Frontend & UX | [esancheezbernal@sfsu.edu](mailto:esancheezbernal@sfsu.edu) |
| Omshree Rajanikant Bharodiya | Data & Logic  | [obharodiya@sfsu.edu](mailto:obharodiya@sfsu.edu)           |

---

## 📌 Overview

**LayoverPlus** is a web application that helps travelers with **2–8 hour layovers** make the most of their time by generating **AI-powered micro-itineraries**.

Instead of waiting in the terminal, users receive a **personalized, timestamped plan** with a clear **risk label**, enabling them to explore nearby food, culture, or sightseeing spots confidently—without missing their next flight.

---

## 🧩 Problem

Travelers often remain in the airport during layovers because they cannot reliably determine whether leaving the airport is safe.

* Existing travel planners focus on **full trips**
* Airport apps focus only on **terminal navigation**

👉 This leaves a gap for **realistic, time-bounded off-airport experiences**

### ✅ LayoverPlus solves this by:

* Estimating **immigration and security processing times**
* Computing **travel time to nearby points of interest (POIs)**
* Enforcing a **configurable return safety buffer**
* Generating a **narrative itinerary grounded in real constraints**

---

## 🏗️ Tech Stack

### Frontend

* Vanilla HTML/CSS/JavaScript prototype
* Leaflet map UI

### Backend

* Node.js + Express
* Time calculations & feasibility logic

### AI Component

* OpenAI Responses API integration
* Generates itinerary wording, explanations, and traveler tips from structured data
* Deterministic backend logic still owns safety constraints, travel-time estimates, and risk scoring

### Data Sources

* Static airport metadata
* OSRM routing estimates
* OpenStreetMap Overpass POI search

---

## ✨ Features

* Input fields for **airport, arrival time, departure time, connection type, and interests**
* Airport-specific **processing assumptions and safety buffers**
* **Feasibility scoring** with `Low`, `Medium`, and `High` risk labels
* Nearby POI search using **OpenStreetMap Overpass**
* Travel time estimation via **OSRM routing**
* Structured **timestamped itinerary blocks**
* AI-generated **narrative summaries**
* Interactive **map view using Leaflet**

---

## 📖 Usage

1. Enter your **arrival airport, arrival time, and next flight departure time**
2. Select your **connection type** (domestic / international)
3. Choose your **interests** (food, culture, sightseeing, shopping)
4. Receive:

   * Risk label
   * Timestamped itinerary
   * Map visualization

---

## 📌 Supported Airports

* `LAX` — Los Angeles International Airport
* `SFO` — San Francisco International Airport
* `JFK` — John F. Kennedy International Airport

---

## 🚀 Run the Project

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open your browser at:
👉 http://localhost:3000

### Enable AI Generation

Create a local `.env` file in the project root:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Then restart the server:

```bash
npm start
```

Without `OPENAI_API_KEY`, the app still works but uses fallback wording instead of AI-generated schedule text.

---

## 📌 API Endpoints

### GET /api/health

Returns service health and API metadata used by the frontend connection checker.

### GET /api/config

Returns configuration and supported options.

### POST /api/plan

Generates a layover itinerary.

#### Example Request Payload:

```json
{
  "airportCode": "SFO",
  "arrivalTime": "2026-04-14T14:30",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "interests": ["food", "culture"]
}
```

Detailed response contracts and error shape:
👉 [docs/api-structure.md](./docs/api-structure.md)

The plan response also includes AI metadata:

```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "used": true,
    "title": "Low-risk SFO food stop",
    "travelerTips": [],
    "error": null
  }
}
```

---

## 🌟 Project Goal

LayoverPlus aims to transform idle layover time into **safe, efficient, and enjoyable micro-adventures** by combining **AI reasoning, real-world constraints, and user preferences**.

---
