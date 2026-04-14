✈️ LayoverPlus

Risk-Aware AI Micro-Itineraries for Airport Layovers
Turn your layover into a safe, time-bounded mini adventure.

👥 Team
Name                         Role            Email
Caleb Ponce                  AI & Backend    cponce8@sfsu.edu
Edson Sanchez Bernal         Frontend & UX   esancheezbernal@sfsu.edu
Omshree Rajanikant Bharodiya Data & Logic    obharodiya@sfsu.edu


📌 Overview
LayoverPlus is a web application that helps travelers with 2–8 hour layovers make the most of their time by generating AI-powered micro-itineraries. Instead of waiting in the terminal, users get a personalized, timestamped plan with a clear risk label — so they can explore nearby food, culture, or sightseeing spots with confidence they won't miss their next flight.

🧩 Problem
Travelers typically stay in the terminal during layovers because they can't reliably judge whether leaving the airport is safe. Existing travel planners target full trips, and airport apps focus only on terminal navigation — leaving a gap for realistic, time-boxed off-airport experiences.
LayoverPlus solves this by:

Estimating immigration/security processing times
Computing travel time to nearby points of interest
Enforcing a configurable return safety buffer
Generating a narrative itinerary grounded in real constraints


🏗️ Tech Stack
Frontend
React / Next.js
Mapbox or Google Maps API

Backend
Python + FastAPI
Time calculations & feasibility logic

AI Component
Pre-trained LLM (API-based)
Generates itinerary descriptions from structured data

Data Sources
Flight schedules / airport metadata
Travel time APIs
Places / POI APIs


✨ Features

- Inputs for airport, departure time, connection type, and interests
- Airport-specific processing assumptions and return safety buffers
- Feasibility scoring with `Low`, `Medium`, and `High` risk labels
- Nearby POI search using OpenStreetMap Overpass
- Travel time estimates using OSRM routing
- Structured itinerary blocks with timestamps
- Grounded narrative summary derived from the computed plan
- Browser map view using Leaflet

📖 Usage

-Enter your arrival airport and next flight departure time
-Select your connection type (domestic / international)
-Choose your interests (food, culture, sightseeing, shopping)
-Get your risk label, timestamped itinerary, and map view

📌 Selected Airports

- `LAX` - Los Angeles International Airport
- `SFO` - San Francisco International Airport
- `JFK` - John F. Kennedy International Airport

📌 Run

1. Install dependencies: npm install

2. Start the server: npm start

3. Open: http://localhost:3000


📌 API

- GET /api/config
- POST /api/plan

For refrence here is an example payload:
{
  "airportCode": "SFO",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "interests": ["food", "culture"]
}




