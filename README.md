# CDF AI Engineering Hackathon — U.S. Renewable Energy Investment Dashboard

**Live URL**: https://cdf-deploy-jash.vercel.app
**Submission Deadline**: April 12, 2026 at 1:00 PM EST
**Status**: Complete — Deployed

---

## Project Overview

A professional-grade, multi-tab renewable energy investment analysis platform built with React + FastAPI. Integrates live public APIs (EIA, NREL) with AI-powered research, full financial modeling, and an interactive Leaflet map. Covers Tier 1, Tier 2, and Tier 3 requirements.

---

## Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
cp .env.example .env   # add your API keys
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`

---

## Submission Checklist

- [x] **Live deployment URL** — https://cdf-deploy-jash.vercel.app
- [x] **Planning document** — [planning/PLANNING.md](planning/PLANNING.md)
- [x] **Application code** — [backend/](backend/) + [frontend/](frontend/)
- [x] **Architecture doc** — [docs/architecture.md](docs/architecture.md)
- [x] **Walkthrough video** — [docs/walkthrough.md](docs/walkthrough.md)
- [x] **Reflection doc** — [docs/reflection.md](docs/reflection.md)
- [x] **Clean git history** — commits track progress by feature and tier

---

## Repository Structure

```
cdf-dashboard/
├── README.md
├── PROBLEM_STATEMENT.md
├── planning/
│   └── PLANNING.md
├── docs/
│   ├── architecture.md
│   ├── walkthrough.md
│   └── reflection.md
├── backend/
│   ├── main.py                  # FastAPI app — EIA/NREL/Groq integrations
│   ├── requirements.txt
│   └── .env                     # API keys (not committed)
└── frontend/
    ├── src/
    │   ├── App.jsx              # All tabs + components
    │   ├── App.css
    │   ├── api/client.js        # API client
    │   └── utils/
    │       ├── exportPDF.js     # PDF report generation
    │       └── exportExcel.js   # Excel model export
    └── package.json
```

---

## Tech Stack

| Component | Tech | Reason |
|---|---|---|
| **Frontend** | React 18 + Vite | Fast HMR, modern ecosystem |
| **Backend** | Python FastAPI | Async API calls, easy deployment |
| **Maps** | Leaflet + react-leaflet | Real tile map, zoom/pan, no API key, free |
| **Charts** | Chart.js + react-chartjs-2 | Interactive, responsive |
| **AI** | Groq (Llama 3.3 70B) | Fast inference, live market data context |
| **PDF Export** | jsPDF + html2canvas | Client-side PDF generation |
| **Excel Export** | xlsx (SheetJS) | Client-side spreadsheet generation |
| **Public APIs** | EIA, NREL | Live renewable energy market data |

---

## Feature Overview

### Tier 1 — Core Requirements

- [x] **Tab 1: Market Overview** — Live electricity prices, solar/wind capacity, 12-month trend chart, top states ranking, data provenance badges on every figure
- [x] **Tab 2: Project Calculator** — Solar/wind/hybrid financial model with IRR, NPV, LCOE, payback; all math runs client-side with zero server roundtrip
- [x] **Tab 3: AI Research Assistant** — Groq-powered analyst with 4 specialist modes, live EIA market data injected into context
- [x] **Tab 4: Geographic Map** — Leaflet choropleth map, hover tooltips, clickable states, compare mode, AI state comparison
- [x] **Cross-Tab Data Flow** — Map click → auto-fills Calculator location + PPA rate; Calculator state → AI Research sidebar context

### Tier 2 — Advanced Features

- [x] **Sensitivity Matrix** — 7×7 IRR grid across capacity factor and PPA rate variations, color-coded by return threshold
- [x] **Monte Carlo Simulation** — 2,000 randomized scenarios, P10/P50/P90 percentiles, probability of hitting target IRR, IRR distribution histogram
- [x] **AI Anomaly Detection** — One-click Claude analysis of EIA market data for investor-relevant anomalies
- [x] **AI Investment Memo** — Full 6-section investment memo generated from live project parameters
- [x] **AI State Comparison** — Multi-state investment trade-off analysis in the Geographic tab
- [x] **PDF Export** — Professional project report with all inputs, results, and AI memo
- [x] **Excel Export** — Full 25-year financial model with all assumptions

### Tier 3 — Exceptional

- [x] **Deal Score Card** — Automated 0–100 investment grade (A through D) from IRR, payback, LCOE, and resource quality; updates live on every input change; includes grid parity indicator when a map state is selected
- [x] **CO2 / Climate Impact** — Annual CO2 offset (tonnes), homes powered, cars removed, trees equivalent; derived from live project output
- [x] **ROI vs Asset Classes** — Horizontal bar chart comparing project IRR against S&P 500, real estate, high-yield bonds, and 10-year Treasury
- [x] **Portfolio Builder** — Add multiple projects, see blended CAPEX-weighted IRR, combined NPV, total production, and aggregate CO2 impact across the portfolio
- [x] **Hybrid Mode** — Solar+Wind 50/50 split project type in the calculator; both halves calculated and results combined
- [x] **Grid Parity Indicator** — Compares PPA rate against the selected state's live grid rate; automatically appears via cross-tab flow from the map

---

## Evaluation Alignment

| Criterion | Weight | How We Address It |
|---|---|---|
| **AI Integration** | 25% | Groq AI in 4 specialist modes with live EIA context; anomaly detection; investment memo generation; state comparison analysis |
| **Technical Architecture** | 25% | FastAPI backend with caching; client-side financial modeling; cross-tab data flow; clean component structure |
| **UI/UX & Data Viz** | 20% | Leaflet tile map; Chart.js charts (line, bar, horizontal bar); sensitivity heatmap; Monte Carlo histogram; responsive design |
| **Data Engineering** | 15% | EIA + NREL APIs integrated; provenance badges on every data point; 24-hour backend caching |
| **Project Management** | 15% | This README; planning doc; architecture doc; clean git history by feature+tier |

---

## Environment Variables

### backend/.env
```
GROQ_API_KEY=...
EIA_API_KEY=...
NREL_API_KEY=...
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Status + configured API keys |
| `GET /api/market/summary` | Live EIA electricity price, capacity, 12-month trend, top states |
| `GET /api/market/states` | All 50 states — solar/wind GW, electricity rate, potential scores |
| `GET /api/location/{state}` | Single state electricity rate + solar/wind capacity factors |
| `POST /api/calculate` | Server-side project economics (mirrors client-side math) |
| `POST /api/monte-carlo` | 2,000-iteration NumPy Monte Carlo simulation |
| `GET /api/research/context` | Aggregated market data snapshot for AI context |
| `POST /api/chat` | AI chat with live market data + calculator state injected |

---

**Built for the CDF AI Engineering Hackathon, April 2026**
