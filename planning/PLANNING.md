# CDF Renewable Energy Dashboard - Planning Document

**Submission Deadline**: April 12, 2026 at 1:00 PM EST
**Build Date**: April 7, 2026
**Status**: In Progress

## Executive Summary

Building a 4-tab renewable energy investment analysis dashboard that integrates live public APIs, performs client-side financial modeling, and provides AI-powered analysis. Focused on Tier 1 requirements with clean architecture and production-quality code.

## Tech Stack & Justification

| Component | Choice | Why |
|-----------|--------|-----|
| **Backend** | Python FastAPI | Already set up, async support for multiple API calls, easy deployment on Render |
| **Frontend** | React 18 + Vite | Already set up, fast HMR, ecosystem (Chart.js, Leaflet for maps) |
| **Maps** | Leaflet.js | Lightweight, free, no API key required (uses OpenStreetMap tiles) |
| **Financial Calc** | Client-side JavaScript | Instant responsiveness, no server round-trips, better UX |
| **AI** | Anthropic Claude API | Already configured, free $5 credit, excellent for analysis tasks |
| **Deployment** | Vercel (frontend) + Render (backend) | Free tiers, easy GitHub integration, fast |

## Public Data Sources

| API | Purpose | Auth | Rate Limit |
|-----|---------|------|-----------|
| **EIA Open Data** | Electricity prices, capacity by state, fuel type | Free API key | 120/hour |
| **NREL PVWatts** | Solar production estimates by location | Free API key | 100/day |
| **NREL Wind Toolkit** | Wind resource data | Free API key | Included |
| **OpenEI** | Utility rates by state/zip | Public data | Unlimited |

## Architecture Overview

### Data Flow
```
Public APIs (EIA, NREL, FRED)
    ↓
Backend (FastAPI)
    - Caching layer (avoid repeated API calls)
    - Data normalization
    - Financial calculations
    ↓
Frontend (React)
    Tab 1 (Market Overview) ← Live electricity prices, capacity trends
    Tab 2 (Project Calc)    ← User inputs + location data
    Tab 3 (AI Research)     ← Market context + current calculator state
    Tab 4 (Geographic)      ← Solar irradiance, electricity prices by region

Cross-Tab Flow:
    - Tab 4 (map click) → Tab 2 (pre-fill location/rates)
    - Tab 2 (scenario) → Tab 1 (compare to market avg)
    - Tab 2 + Tab 4 state → Tab 3 (AI context)
```

### Backend Endpoints (New Design)

```
GET /api/market/
  └─ electricity_prices (national average, trends)
  └─ capacity_by_fuel (solar, wind, hydro, etc.)
  └─ state_rankings (best states for solar/wind)

GET /api/location/{state}/{zip}
  └─ electricity_rates ($/kWh)
  └─ solar_resource (kWh/m2/day)
  └─ wind_resource (avg wind speed)

POST /api/calculate
  └─ Input: project type (solar/wind), size_kw, location, financing
  └─ Output: IRR, NPV, LCOE, annual_production, cashflow

GET /api/research/context
  └─ Returns current market data snapshot for AI

POST /api/chat
  └─ AI research assistant with live data context
```

### Frontend Components (New Design)

**Tab 1: Market Overview**
- Market summary cards (electricity price, capacity, growth rates)
- Electricity price trend chart (EIA historical data)
- Capacity by fuel type bar chart
- Top 10 states ranking

**Tab 2: Project Economics Calculator**
- Solar/Wind selector
- Input form: System size, location (state/zip), capacity factor, cost ($/kW), degradation
- Finance inputs: Debt %, interest rate, term, ITC/PTC assumptions
- Live output: Annual production, revenue, IRR, NPV, LCOE, payback period
- Scenario toggle: Base / Optimistic / Conservative
- Cashflow 10-year chart

**Tab 3: AI Research Assistant**
- Chat interface
- Pre-loaded questions about renewable energy
- AI context includes: current market data + user's calculator inputs
- Conversation history persists in session

**Tab 4: Geographic Visualization**
- Interactive US map (Leaflet)
- Data overlays: Solar irradiance (color intensity) OR Electricity prices (color by cost)
- Clickable states: Show solar/wind potential, electricity rates
- On click, pre-fill calculator with state's average values

## Prioritization & Time Breakdown

**Total Time Available**: ~10-12 hours (April 7 all day)

| Phase | Time | Tasks |
|-------|------|-------|
| 1. Setup | 30 min | Get API keys, test one endpoint, set environment variables |
| 2. Backend | 2 hrs | Redesign endpoints, integrate EIA + NREL APIs, caching |
| 3. Tab 1 | 1.5 hrs | Market Overview component + chart |
| 4. Tab 2 | 2.5 hrs | Project Calculator (most complex) |
| 5. Tab 3 | 1.5 hrs | AI Research with context |
| 6. Tab 4 | 1.5 hrs | Geographic map + data overlay |
| 7. Cross-Tab | 1 hr | Wire data flow between tabs |
| 8. Deploy | 1 hr | Vercel + Render + env vars |
| 9. Polish | 1 hr | UI tweaks, error handling, testing |

**If time is short, cut in this order:**
1. ~~Sensitivity analysis (Tab 2 stretch)~~ → Skip
2. ~~PDF export~~ → Skip
3. Tab 4 (Geographic) → Simplify to text-based state selector instead of map
4. Stretch AI features → Keep basic Q&A only

## What We're Keeping from Original Build

✅ Backend structure (FastAPI app)
✅ React + Vite frontend
✅ API client pattern with axios
✅ Claude integration (redesigned with live data context)

## What's Changing

❌ Mock data → ✅ Live APIs (EIA, NREL)
❌ Your 5 projects → ✅ Generic project calculator
❌ Portfolio chat context → ✅ Market data context
❌ 5-project portfolio → ✅ User can model any solar/wind project

## Evaluation Alignment

| Criteria | How We Address It |
|----------|-------------------|
| **AI Integration (25%)** | Claude research assistant with live market data context. AI cites sources. |
| **Technical Architecture (25%)** | Clean FastAPI backend, React component structure, cross-tab data flow, caching layer |
| **UI/UX (20%)** | Professional design, responsive for 1280px+, loading states, real charts (Chart.js) + map (Leaflet) |
| **Data Engineering (15%)** | Successfully integrate EIA + NREL APIs, normalize data, handle rate limits + failures gracefully |
| **Project Management (15%)** | This planning doc, clean git history, README with architecture, 5-min demo video |

## Success Metrics

By end of day:
- [ ] Live deployment URL working
- [ ] All 4 tabs functional (Tier 1 requirements met)
- [ ] Cross-tab data flow working (2+ instances)
- [ ] AI research assistant responds with specific numbers from live data
- [ ] No crashes during 5-min demo
- [ ] 5-minute walkthrough video recorded
- [ ] README updated with live URL + architecture
- [ ] Clean git history (commits document progress)

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| API rate limiting | Implement backend caching (60-300 sec TTL) |
| API failures | Graceful degradation, fallback mock data for demo |
| Scope creep | Tier 1 only, no stretches unless time permits |
| Deployment issues | Test deployment early (Day 1), not last minute |
| No internet during demo | Pre-cache data locally, use browser DevTools to mock API if needed |

## Next Steps

1. Get API keys (5 min)
2. Test API integrations (30 min)
3. Redesign backend (2 hrs)
4. Build frontend incrementally (6-7 hrs)
5. Deploy + polish (2 hrs)
