# Reflection & Technical Decisions

## What We Built

A professional-grade, 4-tab renewable energy investment platform integrating live US government APIs (EIA, NREL) with AI-powered research, full financial modeling, interactive Leaflet map, and Tier 3 features including an investment grading system and portfolio builder. Covers all Tier 1, Tier 2, and Tier 3 requirements.

**Live URL**: https://cdf-deploy-jash.vercel.app
**Build period**: April 6–12, 2026

---

## Requirements Met

### Tier 1 — Core
- ✅ **Tab 1 (Market Overview)** — Live EIA electricity prices, solar/wind capacity, 12-month trend chart, top states ranking, data provenance badges on every figure
- ✅ **Tab 2 (Project Calculator)** — Solar/wind/hybrid financial model with IRR, NPV, LCOE, payback, 25-year cash flow chart; all math runs client-side
- ✅ **Tab 3 (AI Research)** — Groq (Llama 3.3 70B) with 4 analyst modes, live EIA data injected as context, quick prompts per mode
- ✅ **Tab 4 (Geographic Map)** — Leaflet tile map (CartoDB Dark), choropleth by renewable capacity, hover tooltips, clickable states, compare mode
- ✅ **Cross-Tab Data Flow** — Map click → auto-fills Calculator location + PPA rate + enables Grid Parity; Calculator state → AI Research sidebar context

### Tier 2 — Advanced
- ✅ **Sensitivity Matrix** — 7×7 IRR heatmap across capacity factor × PPA rate variations
- ✅ **Monte Carlo Simulation** — 2,000 NumPy scenarios, P10/P50/P90 percentiles, probability of hitting target IRR, histogram
- ✅ **AI Anomaly Detection** — One-click Groq analysis of live EIA market data for investor signals
- ✅ **AI Investment Memo** — Full 6-section structured memo generated from live project parameters
- ✅ **AI State Comparison** — Multi-state Groq investment trade-off analysis in Geographic tab
- ✅ **PDF Export** — Professional project report via jsPDF + html2canvas
- ✅ **Excel Export** — 25-year financial model spreadsheet via SheetJS

### Tier 3 — Exceptional
- ✅ **Deal Score Card** — Automated 0–100 investment grade (A through D), updated live on every slider move — IRR (35%), payback (25%), LCOE (20%), resource quality (20%)
- ✅ **Grid Parity Indicator** — Compares PPA rate vs. live state grid rate; auto-appears via map cross-tab flow
- ✅ **CO2 / Climate Impact** — Annual CO2 offset, homes powered, cars removed, trees equivalent — all derived from project output
- ✅ **ROI vs Asset Classes** — Horizontal bar chart comparing project IRR against S&P 500, real estate, high-yield bonds, and 10-year Treasury
- ✅ **Portfolio Builder** — Add multiple projects, blended CAPEX-weighted IRR, combined NPV/production/CO2 across the portfolio
- ✅ **Hybrid Mode** — Solar+Wind 50/50 project type — runs both calculations and combines results

---

## Tech Stack Justification

| Tech | Choice | Alternative | Why |
|---|---|---|---|
| **Frontend** | React 18 + Vite | Vue, Svelte | Largest ecosystem for financial dashboards; Chart.js + react-leaflet mature; fast HMR |
| **Backend** | Python FastAPI | Node.js Express | Async by default; NumPy available for Monte Carlo; easy Render deployment |
| **Maps** | Leaflet + react-leaflet | Google Maps, Mapbox, D3 SVG | Real tile map with zoom/pan; zero API key; free CARTO dark tiles match dark theme |
| **Charts** | Chart.js | Recharts, Plotly | Responsive, performant; supports bar, line, horizontal bar; easy custom styling |
| **AI** | Groq (Llama 3.3 70B) | Anthropic Claude, OpenAI GPT-4 | Fast inference; free tier; open model; sufficient reasoning for financial analysis |
| **PDF Export** | jsPDF + html2canvas | Server-side PDF | Client-side generation — no server dependency, no extra infrastructure |
| **Excel Export** | SheetJS (xlsx) | csv download | Full workbook with formulas; investors expect .xlsx format |
| **Deployment** | Vercel + Render | Firebase, AWS Amplify | Free tiers; simple GitHub integration; environment variables built in |

---

## Key Architectural Decisions

### 1. Client-Side Financial Calculations

All IRR/NPV/LCOE math runs in the browser on every render with zero server roundtrip. This was the single best decision — sliders feel instant, no loading spinners, no API dependency for the core feature.

**Trade-off**: Formulas can't be validated server-side. Acceptable for hackathon; production would add server validation.

### 2. Leaflet over D3 SVG Choropleth

The original implementation used D3 SVG rendering (no real tiles). Replaced with Leaflet + react-leaflet mid-build to satisfy the map requirement clearly — real tile layer, zoom/pan, and a library the rubric names explicitly.

**Trade-off**: Slightly larger bundle. Fully worth it — the dark CARTO tiles look dramatically better and zooming/panning is expected behavior.

### 3. 24-Hour Backend Cache

EIA capacity data is annual, prices change monthly. 24h TTL avoids rate-limit pressure during the hackathon demo period while keeping data current enough for investment decisions.

**Trade-off**: Could serve stale data. For production: Redis with shorter TTL + cache invalidation.

### 4. Single App.jsx File

All components live in one file rather than separate component files. This was a pragmatic choice under time pressure — zero import/export overhead, easy to read the whole app at once.

**Trade-off**: File grows large. For production: split into components/, hooks/, utils/.

### 5. Groq for AI Inference

Switched from a slower provider to Groq mid-build. Llama 3.3 70B via Groq is fast enough that the AI responses feel live rather than making users wait. The system prompt injects live EIA data on every request so the model always works with current numbers.

### 6. Cross-Tab via React Props (Not Context)

State flows through App.jsx as props rather than React Context or Redux. Simple and traceable — you can follow the data from map click to calculator to AI sidebar by reading App.jsx top-to-bottom.

---

## What Worked Well

1. **Client-side calculations** — The zero-latency feedback on sliders was the right call from day one
2. **Groq inference speed** — AI responses feel fast enough to be part of the workflow
3. **EIA + NREL APIs** — Reliable, well-documented, free; production-grade data for a hackathon
4. **Leaflet + react-leaflet** — Drop-in React integration, looks great with dark tiles
5. **Deal Score Card concept** — Synthesizes all metrics into one actionable number; the best single feature added
6. **Cross-tab data flow** — When the map click auto-fills the calculator and triggers grid parity, the "aha moment" is immediate and clear
7. **Monte Carlo via NumPy** — The backend simulation is fast and the P10/P50/P90 output is genuinely useful for investors

---

## What Was Challenging

1. **Map library decision** — D3 SVG choropleth was built first, then replaced mid-build with Leaflet. Cost ~2 hours but was the right call.

2. **react-leaflet version conflict** — react-leaflet v5 requires React 19; had to pin to v4 for React 18 compatibility.

3. **GeoJSON state matching** — Leaflet GeoJSON uses full state names (`feature.properties.name`), not FIPS codes or abbreviations. Required building a name→abbreviation lookup from the existing `STATE_NAMES` constant.

4. **Monte Carlo performance** — Running 2,000 simulations in Python with NumPy is fast, but early attempts at client-side JS simulation were too slow. Moving to the backend was the right call.

5. **Financial formula edge cases** — IRR approximation breaks down near 0% equity or degenerate cash flows. Added clamping and max/min guards to handle edge cases gracefully.

6. **AI context injection** — Getting the Groq system prompt to reliably use the injected EIA data (not just training data) required explicit framing: "The following is LIVE data from the EIA API, current as of today. Use ONLY these numbers."

---

## Decisions Made Under Time Pressure

| Decision | Rationale | Trade-off |
|---|---|---|
| Single App.jsx file | No time spent on file organization | Large file; manageable for this scope |
| In-memory cache (not Redis) | No external dependency to set up | Won't persist across server restarts |
| IRR as approximation | Newton-Raphson full implementation is complex | Slightly less precise; directionally correct |
| No user authentication | Out of scope for hackathon | Can't save scenarios between sessions |
| Static NREL irradiance table | NREL API rate limit is 100/day | Real-time irradiance per city not available at scale |
| Portfolio state session-only | No backend persistence needed for demo | Portfolio resets on page refresh |

---

## What We'd Do Differently in Production

1. **Split App.jsx into components** — MarketTab, CalculatorTab, etc. as separate files
2. **Add a database** — Persist scenarios, portfolio, saved research notes across sessions
3. **Add authentication** — User accounts, saved portfolios, scenario sharing
4. **Upgrade cache to Redis** — Shorter TTL with invalidation instead of 24h hard expiry
5. **Add comprehensive tests** — Unit tests for `calcLocally()`, integration tests for cross-tab flow
6. **Real-time data via WebSocket** — Live electricity price ticker on Tab 1
7. **Full NREL PVWatts integration** — Per-location irradiance calls instead of static state table

---

## AI Tools Used During Development

| Tool | Purpose | Impact |
|---|---|---|
| **Claude Code** | Code generation, debugging, architecture, git | High — built every feature, fixed every bug |
| **GitHub Copilot** | In-editor autocompletion | Medium — reduced typing in boilerplate sections |

---

## Lessons Learned

1. **Map library matters** — D3 SVG is powerful but Leaflet is what judges picture when they read "interactive map"
2. **Client-side math is the right call** — Zero latency on the calculator was the feature that made the demo feel live
3. **Tier 3 is about synthesis** — The Deal Score Card doesn't add new data; it synthesizes existing data into a decision. That's what impressed most.
4. **Cross-tab flow needs to be visible** — The "📍 from map" badge and the Grid Parity row appearing only after a map click made the cross-tab connection obvious to any observer
5. **AI works best with structured context** — Injecting a clean JSON snapshot of live EIA data into the system prompt produced far better answers than free-form prompting
6. **Commit history tells a story** — Organizing commits by tier (Tier 1, Tier 2, Tier 3) made progress traceable for judges reviewing the repo

---

## Production Readiness Assessment

**Current (hackathon):**
- ✅ Works end-to-end on desktop
- ✅ Handles all happy paths across all 4 tabs
- ✅ Graceful degradation when APIs are slow
- ⚠️ No user authentication
- ⚠️ Session-only state (portfolio resets on refresh)
- ⚠️ No input validation server-side

**Production next steps:**
- Database for persistence (scenarios, portfolio, research notes)
- Authentication + user accounts
- Server-side input validation
- Monitoring + alerting on API health
- Load testing on Monte Carlo endpoint
- Mobile-responsive layout improvements

---

**Built for the CDF AI Engineering Hackathon, April 2026**
*Deadline: April 12, 2026 at 1:00 PM EST*
