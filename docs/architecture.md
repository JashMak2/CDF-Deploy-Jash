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
    - Monte Carlo simulation (NumPy — 2,000 iterations)
    ↓
Frontend React App (App.jsx — single file, all components)
    ├─ Tab 1: MarketTab       ← EIA electricity prices + state capacity leaders
    ├─ Tab 2: CalculatorTab   ← 100% client-side math, no server roundtrip
    ├─ Tab 3: AITab           ← Groq (Llama 3.3 70B) + live EIA market context
    └─ Tab 4: GeographicTab   ← Leaflet choropleth (PublicaMundi GeoJSON) + EIA state data

Cross-Tab Data Flow
    - Tab 4 (state click) → Tab 2 (pre-fills location + EIA electricity rate + stateRate)
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
    renewables_pct_of_total: 25.4,
    yoy_growth_pct: 14.2,
    top_solar_states: [...],                   # Top 3 by solar capacity
    top_wind_states: [...]                     # Top 3 by wind capacity
  }

GET  /api/market/states        # All states with capacity + investment scores
  Response: {
    all_states: [{
      state: "TX",
      solar_capacity_gw: 25.4,
      wind_capacity_gw: 40.1,
      solar_potential_score: 72,    # 60% capacity + 40% electricity rate
      wind_potential_score: 68,
      electricity_rate_cents_kwh: 11.2,
      lat: 31.97, lon: -99.90
    }, ...]
  }

GET  /api/location/{state}     # Single-state data (calculator pre-fill)
  Response: {
    state: "AZ",
    electricity_rate_cents_kwh: 13.1,
    solar_capacity_factor: 0.27,
    solar_irradiance_kwh_m2_day: 5.5
  }

POST /api/calculate            # Server-side financial calc (mirrors client logic)
  Request: { type, system_size_kw, capacity_factor, cost_per_kw, ... }
  Response: { irr_pct, npv_usd, lcoe_cents_per_kwh, payback_years, cash_flows, ... }

POST /api/monte-carlo          # 2,000-iteration Monte Carlo simulation (NumPy)
  Request: { base_params, n_simulations, target_irr_pct }
  Response: {
    histogram: { bins, counts },
    p10, p25, p50, p75, p90,
    mean, std_dev, min, max,
    prob_above_target
  }

GET  /api/scenarios            # Four reference project presets
  Response: { solar_100mw, solar_10mw, wind_100mw, wind_50mw }

GET  /api/research/context     # Full market + state snapshot for AI context
  Response: { market, states, reference_scenarios }

POST /api/chat                 # AI research assistant (Groq — Llama 3.3 70B)
  Request: {
    messages: [{ role, content }, ...],
    calculator_state: { ... }
  }
  Response: { reply: "..." }

GET  /api/health               # API + key status check
```

### Caching Strategy

All external API responses stored in a Python dict with expiry timestamps:

- **TTL**: 24 hours (`86400s`) for all EIA data
- **Keys**: `"market_summary"`, `"state_rankings"`
- **Rationale**: EIA capacity data is annual; electricity prices change monthly. 24h avoids rate-limit issues while keeping data fresh.

### EIA Data Fetching

Three parallel async calls via `asyncio.gather`:
1. `EIA v2 /electricity/state-electricity-profiles/capability` — solar capacity by state
2. Same endpoint — wind capacity by state
3. `EIA v2 /electricity/retail-sales` — residential electricity prices by state + US avg + 12-month history

Investment scores computed server-side: `score = capacity_norm × 60 + price_norm × 40`

### Monte Carlo (NumPy)

2,000 simulations per request using `np.random.normal` to vary:
- Capacity factor ±12%
- PPA rate ±15%
- Installation cost ±10%
- Interest rate ±15%

Each simulation calls the same financial model, results aggregated into histogram bins + percentiles.

### AI Integration

- **Provider**: Groq API (`llama-3.3-70b-versatile`)
- **System prompt**: Injected with live EIA market numbers (capacity GW, electricity price, top 3 states) and user's current calculator project (type, state, size, PPA rate, IRR)
- **4 analyst modes**: Investment Analyst / Market Opportunities / Technology & Engineering / Policy & Incentives — each gets a different system prompt persona
- **Conversation history**: Full `messages` array sent on every request — Groq handles stateless multi-turn context

---

## Frontend Architecture (React + Vite — `frontend/src/App.jsx`)

### Project Structure

```
frontend/
├── src/
│   ├── App.jsx         # Entire application — all tab components + helpers
│   ├── App.css         # All styles
│   ├── main.jsx        # Entry point — imports Leaflet CSS
│   ├── api/
│   │   └── client.js   # axios wrappers for all backend endpoints
│   └── utils/
│       ├── exportPDF.js    # jsPDF + html2canvas report generation
│       └── exportExcel.js  # SheetJS 25-year financial model export
├── index.html
├── vite.config.js
└── package.json
```

### Component Hierarchy

```
App (tab router + shared state)
├── MarketTab
│   ├── 4 metric cards (price, total GW, solar GW, wind GW) — each with ProvenanceBadge
│   ├── Line chart — 12-month electricity price trend (Chart.js)
│   ├── Top 3 states tables — solar + wind
│   └── AI Anomaly Detection panel (Groq analysis of live data)
│
├── CalculatorTab
│   ├── Scenario bar (Base / Optimistic / Conservative)
│   ├── DealScoreCard (0–100 grade, A–D, grid parity indicator)
│   ├── Input panel (all sliders — calcLocally() on every render)
│   └── Results panel
│       ├── Key returns grid (IRR, NPV, LCOE, Payback)
│       ├── Project performance grid (production, revenue, OpEx, net CF)
│       ├── Capital structure grid (CAPEX, debt, equity, ITC)
│       ├── Bar chart — 25-year annual cash flows (Chart.js)
│       ├── CO2 / Climate Impact grid (tonnes, homes, cars, trees)
│       ├── ROI vs Asset Classes — horizontal bar chart (Chart.js)
│       └── Action buttons (AI Memo, PDF export, Excel export, Add to Portfolio)
│   ├── SensitivityMatrix (7×7 IRR heatmap, color-coded bands)
│   ├── MonteCarloPanel (histogram + percentiles + probability)
│   └── PortfolioPanel (blended IRR, combined NPV/production/CO2, project table)
│
├── AITab
│   ├── Mode selector (Analyst / Opportunities / Technology / Policy)
│   ├── Messages area (chat history with avatars + timestamps)
│   ├── Quick-prompt buttons (4 per mode)
│   ├── Text input + send
│   └── Right sidebar (live project context from Calculator + saved research notes)
│
└── GeographicTab
    ├── Mode toggle (Map View / Compare States)
    ├── USMap — Leaflet MapContainer
    │   ├── TileLayer (CartoDB Dark Matter)
    │   ├── GeoJSON layer (choropleth — YlOrRd by total renewable capacity)
    │   └── Tooltips (solar GW, wind GW, electricity rate, investment score)
    ├── State detail panel (investment score, solar GW, wind GW, rate)
    └── Compare mode
        ├── Multi-select state cards
        ├── Side-by-side metrics table
        └── AI Compare button (Groq multi-state investment analysis)
```

### Shared App State

```javascript
// App component — passed as props (no Context API needed)

const [calculatorState, setCalculatorState] = useState({})
// Set by CalculatorTab.onUpdate on every input change
// Contains: type, state, system_size_kw, ppa_rate_cents_kwh,
//           irr_pct, degradation_rate_pct, escalation_rate_pct
// Consumed by: AITab sidebar + every POST /api/chat request

const [geoSelection, setGeoSelection] = useState(null)
// Set by GeographicTab.onSelectState on map click
// Contains: { state: "AZ", rate: 13.1 }
// Consumed by: CalculatorTab useEffect → updates state, ppaRate, stateRate
```

### Client-Side Calculator (`calcLocally` + `combineResults`)

All financial math runs synchronously in the browser on every render — zero server roundtrip. Mirrors `POST /api/calculate`.

**Technology types:**
- `solar` / `wind` — runs `calcLocally()` once with full system size
- `hybrid` — runs `calcLocally()` twice (solar 50% + wind 50%), combines via `combineResults()`: additive metrics summed (CAPEX, NPV, production, cash flows), ratio metrics averaged (IRR, LCOE, payback)

**Year-by-year loop (25 years):**
```
production_yr = baseProduction × (1 − degradation)^(year−1)
revenue_yr    = production_yr × ppaRate × (1 + escalation)^(year−1) / 100
equityCF_yr   = revenue_yr − opex − debtService − taxes
npv          += equityCF_yr / (1.08)^year
```

**Output metrics:** IRR (equity return approximation), NPV (8% discount), LCOE, payback period, 25-year cash flow array.

### Deal Score Card (`DealScoreCard` component)

Computed purely from `result` and `capFactor` — no API calls:

| Factor | Weight | Thresholds |
|---|---|---|
| IRR | 35% | ≥15%=100, 10–15%=75, 7–10%=50, <7%=20 |
| Payback | 25% | ≤8yr=100, ≤12yr=70, ≤16yr=40, >16yr=10 |
| LCOE | 20% | ≤4¢=100, ≤6¢=75, ≤9¢=50, >9¢=20 |
| Resource (CF) | 20% | ≥30%=90, ≥25%=75, ≥20%=60, ≥15%=45, <15%=25 |

Score → Grade: ≥85=A, ≥75=A−, ≥65=B+, ≥55=B, ≥45=C, <45=D

Grid parity row appears only when `stateRate` is set (via map cross-tab flow), comparing PPA rate against the live state electricity rate.

### Map Implementation (Leaflet)

- **Library**: `leaflet` + `react-leaflet@4`
- **Tile layer**: CartoDB Dark Matter (`basemaps.cartocdn.com/dark_all`)
- **GeoJSON source**: PublicaMundi US States GeoJSON (fetched once on mount)
- **State matching**: `feature.properties.name` → `STATE_NAMES` object → `stateByAbbr` lookup
- **Color scale**: `d3.interpolateYlOrRd(cap / maxCap)` — YlOrRd gradient by total solar+wind GW
- **Interaction**: `onEachFeature` binds rich tooltip (solar GW, wind GW, rate, score) + click handler
- **Re-render on selection**: `key={selectedState + '-' + allStates.length}` forces GeoJSON re-mount when selected state or data changes

### Cross-Tab Data Flow (2 instances)

**Flow 1: Geographic → Calculator**
```
User clicks state on Leaflet map
  → handleStateSelect(abbr) in GeographicTab
  → onSelectState({ state: abbr, rate: electricity_rate_cents_kwh })
  → App: setGeoSelection({ state, rate })
  → CalculatorTab useEffect([geoSelection])
  → setState(abbr) + setPpaRate(rate) + setStateRate(rate)
  → "📍 from map" badge appears next to selected state
  → Grid Parity row appears in DealScoreCard
```

**Flow 2: Calculator → AI Research**
```
User edits any calculator input
  → calcLocally() / combineResults() re-run synchronously
  → useEffect([type, state, sizeKw, ppaRate, irr_pct, ...])
  → onUpdate(calculatorState) propagates to App
  → calculatorState prop flows into AITab
  → Displayed in right sidebar ("Your Project" panel)
  → Included in every POST /api/chat as calculator_state
  → Injected into Groq system prompt: "USER PROJECT: {...}"
```

---

## Data Sources

| API | What's Used | How |
|---|---|---|
| **EIA v2** `/electricity/state-electricity-profiles/capability` | Solar + wind installed capacity (MW) by state | Backend — 3 parallel async calls, 24h cache |
| **EIA v2** `/electricity/retail-sales` | Electricity price by state + US avg + 12-month history | Backend — same request batch |
| **NREL PVWatts v8** | Solar capacity factor + irradiance by state | Backend — static lookup table derived from NREL data |
| **PublicaMundi GeoJSON** | US state boundary polygons for Leaflet choropleth | Frontend — fetched once from GitHub CDN on mount |
| **CartoDB Dark Matter** | Map tile layer | Frontend — Leaflet TileLayer, no API key required |
| **Groq API** | LLM inference (Llama 3.3 70B) | Backend — `POST /api/chat` |

---

## Deployment

### Frontend → Vercel
- Build command: `npm run build` → `/dist`
- Env var: `VITE_API_URL` pointing to backend URL
- Static hosting, CDN-distributed, auto-deploy on git push

### Backend → Render
- Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Env vars: `EIA_API_KEY`, `NREL_API_KEY`, `GROQ_API_KEY`
- Health check: `GET /api/health`
- CORS: configured to allow deployed frontend origin

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
