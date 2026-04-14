# Capstone-Project-CSC-603
✈️ LayoverPlus

Risk-Aware AI Micro-Itineraries for Airport Layovers
Turn your layover into a safe, time-bounded mini adventure.


📌 Overview
LayoverPlus is a web application that helps travelers with 2–8 hour layovers make the most of their time by generating AI-powered micro-itineraries. Instead of waiting in the terminal, users get a personalized, timestamped plan with a clear risk label — so they can explore nearby food, culture, or sightseeing spots with confidence they won't miss their next flight.

🧩 Problem
Travelers typically stay in the terminal during layovers because they can't reliably judge whether leaving the airport is safe. Existing travel planners target full trips, and airport apps focus only on terminal navigation — leaving a gap for realistic, time-boxed off-airport experiences.
LayoverPlus solves this by:

Estimating immigration/security processing times
Computing travel time to nearby points of interest
Enforcing a configurable return safety buffer
Generating a narrative itinerary grounded in real constraints


✨ Features
🕐 Feasibility Calculator — Computes your usable time window: arrival → processing → activity → return buffer
📍 Smart POI Recommendations — Suggests nearby activities filtered by your interests (food, culture, sightseeing, shopping)
🗓️ Timestamped Micro-Itinerary — A clear schedule with a "return-by" deadline
🟢🟡🔴 Risk Label — Not Recommended / Tight / Comfortable with the factors driving it
🗺️ Map View — Visual display of suggested locations and routes


🏗️ Tech Stack
Frontend:
React / Next.js
Mapbox or Google Maps API

Backend:
Python + FastAPI
Time calculations & feasibility logic

AI Component:
Pre-trained LLM (API-based)
Generates itinerary descriptions from structured data

Data Sources:
Flight schedules / airport metadata
Travel time APIs
Places / POI APIs

🎯 Goal
Build a working prototype that helps users safely explore during layovers without missing their flights.
