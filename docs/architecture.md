# Architecture Overview

## System Design

### High-Level Data Flow

```
Public APIs (EIA v2, NREL PVWatts)
    ↓
Backend FastAPI (main.py)
    - 3 parallel async EIA calls (solar capacity, wind capacity, electricity prices)
    - 24-hour in-memory cache (avoids repeated API hits)
    - Data normalization + investment score calculation
    ↓
Frontend React App (App.jsx — single file, all components)
    ├─ Tab 1: MarketTab      ← EIA electricity prices + state capacity leaders
    ├─ Tab 2: CalculatorTab  ← 100% client-side math, no server roundtrip
    ├─ Tab 3: AITab          ← Groq (Llama 3.3 70B) + live EIA market context
    └─ Tab 4: GeographicTab  ← D3 choropleth (us-atlas TopoJSON) + EIA state data

Cross-Tab Data Flow
    - Tab 4 (state click) → Tab 2 (pre-fills location + EIA electricity rate)
    - Tab 2 (project params + IRR) → Tab 3 (injected into AI system prompt)
```

---

## Backend Architecture (FastAPI — `backend/main.py`)

### Project Structure

```
backend/
├── main.py          # Single-file FastAPI app: all routes + helpers
├── requirements.txt
└── .env             # API keys (NOT committed)
```

### Endpoints

```
GET  /                         # Health check — confirms API is running

GET  /api/market/summary       # Market overview data
  Response: {
    electricity_price_cents_per_kwh: 14.7,
    price_history: [["2025-01", 14.5], ...],   # 12 months newest-first
    us_renewable_capacity_gw: 295.0,
    solar_capacity_gw: 150.0,
    wind_capacity_gw: 145.0,
    renewables_pct_of_total: 25.4,             # Static EIA published figure
    yoy_growth_pct: 14.2,                      # Static EIA published figure
    top_solar_states: [...],                   # Top 3 by solar capacity
    top_wind_states: [...]                     # Top 3 by wind capacity
  }

GET  /api/market/states        # All states with capacity + investment scores
  Response: {
    all_states: [{
      state: "TX",
      solar_capacity_gw: 25.4,
      wind_capacity_gw: 40.1,
      solar_potential_score: 72,      # 60% capacity + 40% electricity rate
      wind_potential_score: 68,
      electricity_rate_cents_kwh: 11.2,
      lat: 31.97, lon: -99.90
    }, ...],
    solar_potential: [...],           # Top 10 by solar_capacity_gw
    wind_potential: [...]             # Top 10 by wind_capacity_gw
  }

GET  /api/location/{state}     # Single-state data (used for calculator pre-fill)
  Response: {
    state: "AZ",
    electricity_rate_cents_kwh: 13.1,
    solar_capacity_factor: 0.27,
    solar_irradiance_kwh_m2_day: 5.5
  }

POST /api/calculate            # Server-side financial calc (mirrors client logic)
  Request: { type, system_size_kw, capacity_factor, cost_per_kw, ... }
  Response: { irr_pct, npv_usd, lcoe_cents_per_kwh, payback_years, ... }

GET  /api/scenarios            # Four reference project presets
  Response: { solar_100mw, solar_10mw, wind_100mw, wind_50mw }

GET  /api/research/context     # Full market + state snapshot for AI context
  Response: { market, states, reference_scenarios }

POST /api/chat                 # AI research assistant (Groq — Llama 3.3 70B)
  Request: {
    messages: [{ role, content }, ...],   # Full conversation history
    calculator_state: { ... }             # User's current project from Tab 2
  }
  Response: { reply: "..." }

GET  /api/health               # API + key status check
```

### Caching Strategy

All external API responses are stored in a Python dict with expiry timestamps:

- **TTL**: 24 hours (`86400s`) for all EIA data
- **Keys**: `"market_summary"`, `"state_rankings"`
- **Rationale**: EIA capacity data is annual; electricity prices change monthly. 24h avoids rate-limit issues while keeping data fresh for judges reviewing the live site.

### EIA Data Fetching

Three parallel async calls via `asyncio.gather`:
1. `EIA v2 /electricity/state-electricity-profiles/capability` — solar capacity by state
2. Same endpoint — wind capacity by state
3. `EIA v2 /electricity/retail-sales` — residential electricity prices by state

Investment scores are computed server-side: `solar_score = capacity_norm × 60 + price_norm × 40`.

### AI Integration

- **Provider**: Groq API (`llama-3.3-70b-versatile`)
- **System prompt**: Injected with live EIA market numbers (capacity GW, electricity price, top 3 states for solar/wind) and the user's current calculator project (type, state, size, PPA rate, IRR)
- **Citation instruction**: Responses are instructed to attribute numbers to EIA/NREL by source name
- **Conversation history**: Full `messages` array is sent on every request — Groq handles stateless multi-turn context

---

## Frontend Architecture (React + Vite — `frontend/src/App.jsx`)

### Project Structure

```
frontend/
├── src/
│   ├── App.jsx       # Entire application — all 4 tab components + helpers
│   ├── App.css       # All styles
│   └── api/
│       └── client.js # axios wrappers for all backend endpoints
├── index.html
├── vite.config.js
└── package.json
```

All tab components live in `App.jsx` as named functions (`MarketTab`, `CalculatorTab`, `AITab`, `GeographicTab`, `USMap`). There is no `components/` directory.

### Component Hierarchy

```
App (tab router + shared state)
├── MarketTab
│   ├── 4 metric cards (price, total GW, solar GW, wind GW)
│   ├── Line chart — 12-month electricity price trend (Chart.js)
│   └── Top 3 states tables — solar + wind
├── CalculatorTab
│   ├── Scenario bar (Base / Optimistic / Conservative)
│   ├── Input panel (all sliders — runs calcLocally on every render)
│   └── Results panel
│       ├── Key returns grid (IRR, NPV, LCOE, Payback)
│       ├── Project performance grid
│       ├── Capital structure grid
│       └── Bar chart — 25-year annual cash flows (Chart.js)
├── AITab
│   ├── Mode selector (Analyst / Opportunities / Technology / Policy)
│   ├── Messages area (chat history)
│   ├── Quick-prompt buttons (4 per mode)
│   ├── Text input + send
│   └── Right sidebar (active project context + saved notes)
└── GeographicTab
    ├── Mode toggle (Map View / Compare States)
    ├── USMap (D3 choropleth — capacity heatmap, clickable states)
    ├── State detail panel (investment score, solar GW, wind GW, rate)
    └── Compare mode (multi-select state cards + comparison table)
```

### Shared App State

```javascript
// App component — passed as props (no Context API)
const [calculatorState, setCalculatorState] = useState({})
// Set by CalculatorTab.onUpdate — contains: type, state, system_size_kw,
// ppa_rate_cents_kwh, irr_pct, degradation_rate_pct, escalation_rate_pct
// Consumed by: AITab (injected into every chat request)

const [geoSelection, setGeoSelection] = useState(null)
// Set by GeographicTab.onSelectState — contains: { state, rate }
// Consumed by: CalculatorTab useEffect → updates state + ppaRate sliders
```

### Client-Side Calculator (`calcLocally`)

All financial math runs synchronously in the browser on every render — no server roundtrip. Mirrors the logic in `POST /api/calculate`.

**Inputs (all editable sliders):**
- System size (kW), capacity factor, degradation rate (%/yr)
- Installation cost ($/kW), O&M cost ($/kW-yr), PPA rate (¢/kWh), escalation rate (%/yr)
- Debt ratio (%), interest rate (%), loan term (yrs), federal ITC (%)

**Year-by-year loop (25 years):**
```
production_yr = baseProduction × (1 − degradation)^(year−1)
revenue_yr    = production_yr × ppaRate × (1 + escalation)^(year−1) / 100
equityCF_yr   = revenue_yr − opex − debtService − taxes
npv          += equityCF_yr / (1.08)^year
```

**Output metrics:** IRR (approximation), NPV (8% discount), LCOE, payback period, 25-year cash flow array.

### Map Implementation

- **Library**: D3.js + `topojson-client`
- **Geo data**: `cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json` (loaded once)
- **FIPS mapping**: Hardcoded `FIPS_TO_ABBR` dict maps numeric state IDs → abbreviations
- **Color scale**: `d3.scaleSequential + d3.interpolateYlOrRd` — maps total renewable GW per state
- **Interaction**: Click fires `onSelectState({ state, rate })` → updates App's `geoSelection` → CalculatorTab syncs

### Cross-Tab Data Flow (2 instances)

**Flow 1: Geographic → Calculator**
```
User clicks state on map
  → handleStateSelect(abbr) in GeographicTab
  → onSelectState({ state: abbr, rate: electricity_rate_cents_kwh })
  → App: setGeoSelection({ state, rate })
  → CalculatorTab useEffect([geoSelection])
  → setState(abbr) + setPpaRate(rate)
  → "📍 from map" badge appears next to selected state
```

**Flow 2: Calculator → AI Research**
```
User edits any calculator input
  → calcLocally() re-runs synchronously
  → useEffect([type, state, sizeKw, ppaRate, irr_pct, ...])
  → onUpdate(calculatorState) in App
  → calculatorState prop flows to AITab
  → Displayed in right sidebar ("Your Project" panel)
  → Included in every POST /api/chat request as calculator_state
  → Injected into Groq system prompt: "USER PROJECT: {...}"
```

---

## Data Sources

| API | What's Used | How |
|-----|-------------|-----|
| **EIA v2** `/electricity/state-electricity-profiles/capability` | Solar + wind installed capacity (MW) by state | Backend — 3 parallel async calls, 24h cache |
| **EIA v2** `/electricity/retail-sales` | Residential electricity price by state + US average | Backend — same request batch |
| **NREL PVWatts v8** | Solar capacity factor + irradiance by lat/lon | Backend — `GET /api/location/{state}` (on-demand) |
| **us-atlas TopoJSON** | US state boundary GeoJSON for choropleth | Frontend — fetched once from CDN |
| **Groq API** | LLM inference (Llama 3.3 70B) | Backend — `POST /api/chat` |

---

## Deployment

### Frontend → Vercel (or Netlify)
- Build: `npm run build` → `/dist`
- Env var: `VITE_API_URL` pointing to backend URL
- Static hosting, CDN-distributed

### Backend → Render (or Railway)
- Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Env vars: `EIA_API_KEY`, `NREL_API_KEY`, `GROQ_API_KEY`
- Health check: `GET /api/health`
- CORS: configured to allow the deployed frontend origin

### Environment Variables

**Backend `.env` (never committed):**
```
EIA_API_KEY=...
NREL_API_KEY=...
GROQ_API_KEY=...
```

**Frontend `.env` (never committed):**
```
VITE_API_URL=https://your-backend.onrender.com
```
