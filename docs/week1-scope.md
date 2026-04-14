# Week 1 Scope and Rules

## Scope

LayoverPlus Week 1 is scoped to three U.S. airports:

- `LAX` - Los Angeles International Airport
- `SFO` - San Francisco International Airport
- `JFK` - John F. Kennedy International Airport

User inputs in scope:

- arrival airport
- next-flight departure time
- connection type (`domestic` or `international`)
- interests (`food`, `culture`, `sightseeing`, `shopping`)

Outputs in scope:

- feasibility score
- risk label
- itinerary schedule with timestamps
- suggested POI and nearby candidates
- map-ready location data

## Feasibility Rules

The app computes:

`layover time - airport processing time - outbound travel - dwell time - inbound travel - return safety buffer`

An itinerary is feasible only when the remaining slack is at least `0` minutes.

Scoring factors:

- larger slack increases score
- shorter one-way travel time increases score
- enough dwell time at the destination increases score

Risk labels:

- `Low`: strong slack and high score
- `Medium`: feasible but tighter
- `High`: infeasible or marginal

## Airport Assumptions

### LAX

- processing time: `35` domestic, `60` international
- return buffer: `90` domestic, `150` international
- recommended activity window: `75` domestic, `60` international
- max one-way travel target: `30` domestic, `20` international

### SFO

- processing time: `30` domestic, `55` international
- return buffer: `85` domestic, `140` international
- recommended activity window: `80` domestic, `60` international
- max one-way travel target: `28` domestic, `18` international

### JFK

- processing time: `40` domestic, `65` international
- return buffer: `95` domestic, `155` international
- recommended activity window: `75` domestic, `55` international
- max one-way travel target: `30` domestic, `18` international

## Safety Buffer Policy

Return buffer covers:

- airport re-entry
- terminal transit
- security uncertainty
- boarding margin

International connections use stricter assumptions because re-entry and screening are less predictable.
