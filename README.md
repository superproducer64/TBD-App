# TBD — Homebuyer Intelligence App

> To Be Decided. Is this property the right fit?

A neighborhood intelligence platform surfacing data realtors aren't required to disclose — crime patterns, flood risk, environmental contamination, and traffic congestion.

## Data Sources

| Layer | Source | Update Frequency |
|---|---|---|
| Crime | HPD NIBRS / Houston Open Data Portal | Monthly |
| Flood | FEMA National Flood Hazard Layer (NFHL) | As updated |
| Environmental | EPA SEMS / Superfund | As updated |
| Traffic | Google Maps Distance Matrix API | Real-time |

## Setup

### 1. Clone and deploy to Vercel

```bash
git clone https://github.com/YOUR_USERNAME/tbd-app
cd tbd-app
vercel deploy
```

### 2. Data files needed

- `NIBRSPublicView.csv` — Download from [Houston Open Data Portal](https://data.houstontx.gov/dataset/houston-police-department-crime-statistics)
- `sems.csv` — Download from [EPA SEMS](https://www.epa.gov/superfund/search-superfund-sites-where-you-live)

### 3. API Keys

- Google Maps API key — [Google Cloud Console](https://console.cloud.google.com)
  - Enable: Distance Matrix API, Geocoding API, Maps JavaScript API

## Architecture

```
Browser
  ├── Crime scoring (local CSV, haversine radius search)
  ├── Environmental scoring (local CSV, haversine radius search)
  ├── /api/flood → FEMA NFHL WFS/REST (server-side proxy)
  └── /api/traffic → Google Maps Distance Matrix (server-side proxy)
```

## Coverage

Phase 1: Houston / Harris County
Phase 2: Fort Bend, Montgomery County
Phase 3: Brazoria, Galveston County
Phase 4: Texas DPS statewide

## Houston Metro — Phase 1 Data Sources

- Houston Police Department
- Harris County Justice Administration Department
- Harris County Sheriff's Office
- EPA SEMS Superfund Sites
- FEMA National Flood Hazard Layer
- Google Maps Traffic
