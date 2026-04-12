# CDF Renewable Energy Dashboard — Planning Document

**Submission Deadline**: April 12, 2026 at 1:00 PM EST
**Build Period**: April 6–12, 2026
**Status**: Complete — All Tier 1, 2, and 3 features shipped and deployed

---

## Executive Summary

Built a professional-grade, 4-tab renewable energy investment platform integrating live US government APIs (EIA, NREL), a Groq-powered AI analyst, full financial modeling with risk simulation, an interactive Leaflet map, and a suite of Tier 3 features including an investment grading system and portfolio builder. All deployed on Vercel at https://cdf-deploy-jash.vercel.app.

---

## Tech Stack & Justification

| Component | Choice | Why |
|---|---|---|
| **Backend** | Python FastAPI | Async API calls, fast deployment on Render, clean endpoint design |
| **Frontend** | React 18 + Vite | Fast HMR, Chart.js + react-leaflet ecosystem |
| **Maps** | Leaflet + react-leaflet | Real tile map with zoom/pan, free (OpenStreetMap/CARTO tiles), no API key required |
| **Charts** | Chart.js + react-chartjs-2 | Interactive line/bar/horizontal charts, responsive |
| **Financial Calc** | Client-side JavaScript | Instant responsiveness, zero server roundtrip, better UX |
| **AI** | Groq (Llama 3.3 70B) | Fast inference, live EIA market data injected as context |
| **PDF Export** | jsPDF + html2canvas | Client-side generation, no server dependency |
| **Excel Export** | xlsx (SheetJS) | Client-side 25-year financial model spreadsheet |
| **Deployment** | Vercel (frontend) + Render (backend) | Free tiers, GitHub integration, fast CI/CD |

---

## Public Data Sources

| API | Purpose | Auth |
|---|---|---|
| **EIA Open Data v2** | Electricity prices, solar/wind capacity by state, 12-month trends | Free API key |
| **NREL PVWatts v8** | Solar resource data, capacity factors by state | Free API key |
| **CARTO Dark Matter** | Map tile layer for Leaflet choropleth | Free, no key required |
| **US Atlas TopoJSON** | State boundary geometry | Public CDN |

---

## Architecture

### Data Flow

```
EIA API + NREL API
    ↓
FastAPI Backend (24hr cache layer)
    ↓
React Frontend
    Tab 1 (Market Overview)  ← Live electricity prices, capacity, trends
    Tab 2 (Project Calc)     ← User inputs, client-side IRR/NPV/LCOE math
    Tab 3 (AI Research)      ← Live market context + calculator state
    Tab 4 (Geographic)       ← Leaflet map, state rankings, compare mode

Cross-Tab Flow:
    Tab 4 (map click) → Tab 2 (auto-fill location + PPA rate)
    Tab 2 (calculator state) → Tab 3 (AI sidebar context)
```

### Backend Endpoints

```
GET  /api/health                 — Status, configured API keys
GET  /api/market/summary         — Live EIA price, capacity, 12-month trend, top states
GET  /api/market/states          — All 50 states: solar/wind GW, rates, potential scores
GET  /api/location/{state}       — Single state electricity rate + capacity factors
POST /api/calculate              — Project economics (mirrors client-side math)
POST /api/monte-carlo            — 2,000-iteration NumPy simulation
GET  /api/research/context       — Aggregated market snapshot for AI
POST /api/chat                   — Groq AI with live market data + project context
```

---

## What Was Built

### Tier 1 — Core Requirements (Complete)

**Tab 1: Market Overview**
- Live EIA electricity price, total renewable capacity, solar GW, wind GW
- Renewables % of total US generation, YoY growth
- 12-month electricity price trend (line chart)
- Top 3 states for solar + top 3 for wind (tables with capacity, score, irradiance/wind speed)
- Data provenance badge on every single figure (source, endpoint, timestamp)
- Refresh Data button
- AI Anomaly Detection — Claude analyzes the live market data for investor signals

**Tab 2: Project Economics Calculator**
- Technology selector: Solar PV / Wind Turbine / Hybrid (Solar+Wind 50/50)
- State selector with search (all 50 states + DC)
- Sliders: system size (0.5–100 MW), capacity factor, install cost, PPA rate, O&M, debt ratio, interest rate, loan term, ITC %, degradation rate, PPA escalation rate
- Scenario presets: Base Case / Optimistic / Conservative
- Outputs: IRR, NPV (8% discount), LCOE, payback period, annual production, revenue, OpEx, net cash flow, CAPEX, debt, equity, ITC benefit
- 25-year annual cash flow bar chart

**Tab 3: AI Research Assistant**
- Groq (Llama 3.3 70B) with live EIA market data injected as system context
- 4 analyst modes: Investment Analyst, Market Opportunities, Technology & Engineering, Policy & Incentives
- 4 quick-prompt buttons per mode
- Free-text chat with full conversation history
- Project context sidebar showing live-synced calculator state (cross-tab flow #2)
- Save research notes, Clear conversation

**Tab 4: Geographic Map**
- Leaflet choropleth map (CartoDB Dark Matter tiles — full zoom/pan)
- All 50 states colored by total renewable capacity (YlOrRd gradient scale)
- Hover tooltip: state name, solar GW, wind GW, electricity rate, investment score
- Click state: highlights it, shows detail panel, AND auto-fills Calculator location + PPA rate (cross-tab flow #1)
- Compare States mode: multi-select state cards, side-by-side metrics table
- AI Compare: sends selected states to Groq for investment trade-off analysis

### Tier 2 — Advanced Features (Complete)

- **Sensitivity Matrix**: 7×7 IRR grid varying capacity factor (±30%) and PPA rate (±30%); color-coded by return threshold bands; current inputs highlighted
- **Monte Carlo Simulation**: 2,000 scenarios with NumPy; varies cap factor (±12%), PPA rate (±15%), install cost (±10%), interest rate (±15%); P10/P25/P50/P75/P90 percentiles; target IRR slider; probability of success; IRR distribution histogram
- **AI Investment Memo**: 6-section structured memo (Executive Summary, Project Overview, Market Context, Financial Highlights, Key Risks, Recommendation) generated by Groq from live project parameters
- **PDF Export**: Full project report via jsPDF + html2canvas
- **Excel Export**: 25-year financial model spreadsheet via SheetJS

### Tier 3 — Exceptional (Complete)

- **Deal Score Card**: Automated 0–100 investment grade (A / A− / B+ / B / C / D) calculated from IRR (35%), payback period (25%), LCOE (20%), and resource quality/capacity factor (20%); updates live on every slider move; letter grade colored green→red; per-factor ✅/⚠️/❌ breakdown
- **Grid Parity Indicator**: Compares user's PPA rate against the selected state's live grid electricity rate; shows margin in cents and "strong offtake / verify offtake" signal; appears automatically via cross-tab map flow
- **CO2 / Climate Impact**: Annual CO2 offset in tonnes (0.386 kg/kWh US grid avg), homes powered (10,649 kWh/yr avg), cars removed (4,600 kg CO2/car/yr), trees equivalent (21.77 kg CO2/tree/yr)
- **ROI vs Asset Classes**: Horizontal bar chart comparing project IRR against S&P 500 (10%), real estate (7%), high-yield bonds (8%), 10-year Treasury (4.5%)
- **Portfolio Builder**: Add any number of projects; shows blended CAPEX-weighted IRR, combined NPV, total annual production, total CO2 offset, total homes powered; per-project table with IRR color-graded green/amber/red
- **Hybrid Mode**: Solar+Wind 50/50 project type; runs calcLocally() twice with half the system size each, combines results; IRR/LCOE/payback averaged, NPV/CAPEX/production summed

---

## Prioritization Decisions

### What was cut from original plan (and why)
- FRED API integration — EIA alone provided sufficient economic data
- Per-zip-code granularity — state-level sufficient for investment decisions

### What was added beyond original plan
- Monte Carlo simulation (backend NumPy)
- Sensitivity matrix heatmap
- PDF + Excel export
- AI Investment Memo
- Leaflet tile map (upgraded from D3 SVG choropleth)
- Deal Score Card + Grid Parity
- CO2 / Climate Impact panel
- ROI benchmarking chart
- Portfolio Builder
- Hybrid project type

---

## Evaluation Alignment

| Criterion | Weight | How We Address It |
|---|---|---|
| **AI Integration (25%)** | 25% | Groq AI in 4 specialist modes with live EIA market data context; anomaly detection on Tab 1; investment memo generation; multi-state comparison analysis; project context auto-synced from calculator |
| **Technical Architecture (25%)** | 25% | FastAPI backend with 24hr caching; all calculator math runs client-side (zero latency); two cross-tab data flows wired through React state; clean component separation |
| **UI/UX & Data Viz (20%)** | 20% | Leaflet tile map with choropleth; line/bar/horizontal-bar charts; sensitivity heatmap; Monte Carlo histogram; deal score card; fully responsive layout; dark theme |
| **Data Engineering (15%)** | 15% | EIA v2 + NREL APIs; provenance badge on every data point (source + endpoint + timestamp); 24hr backend cache; graceful degradation on API failure |
| **Project Management (15%)** | 15% | This planning doc; README with full feature inventory; architecture doc; clean git history organized by tier; deployed before deadline |

---

## Success Metrics — Final Status

- [x] Live deployment URL working
- [x] All 4 tabs functional — Tier 1 requirements fully met
- [x] Cross-tab data flow — 2 instances (map→calculator, calculator→AI)
- [x] AI responds with specific numbers from live EIA data
- [x] Tier 2 features — sensitivity matrix, Monte Carlo, PDF/Excel, AI memo
- [x] Tier 3 features — deal score, portfolio builder, CO2 impact, ROI benchmarking
- [x] No crashes during demo
- [x] README updated with live URL + full feature inventory
- [x] Planning document updated
- [x] Clean git history organized by tier and feature
- [ ] 5-minute walkthrough video — recording April 12 before 1pm EST
