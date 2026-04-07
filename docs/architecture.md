# Architecture Overview

## System Design

### High-Level Data Flow

```
Public APIs (EIA, NREL, OpenEI)
    ↓
Backend FastAPI (Caching Layer)
    - Normalize data
    - Cache responses (60-300s TTL)
    - Serve endpoints for frontend
    ↓
Frontend React Application
    ├─ Tab 1: Market Overview ← Live prices, capacity, trends
    ├─ Tab 2: Project Calculator ← User inputs, live rates by location
    ├─ Tab 3: AI Research ← Market context + calculator state
    └─ Tab 4: Geographic Map ← Solar resource, electricity prices by state
    ↓
Cross-Tab Data Flow
    - Tab 4 (state click) → Tab 2 (pre-fill location/rates)
    - Tab 2 (scenario) → Tab 1 (compare to market avg)
    - Tab 2 + Tab 4 state → Tab 3 (AI context)
```

---

## Backend Architecture (FastAPI)

### Project Structure

```
backend/
├── main.py                  # FastAPI app + routes
├── requirements.txt         # Dependencies
└── .env                     # API keys (NOT committed)
```

### Core Endpoints

#### Market Overview

```
GET /api/market/
  Response: {
    "electricity_price": 0.145,           # $/kWh national average
    "price_trend": [...]                  # Last 12 months
    "capacity_by_fuel": {
      "solar": 153000,                    # MW
      "wind": 145000,
      "hydro": 102000,
      ...
    },
    "state_rankings": [
      { "state": "TX", "solar_mw": 45000, "wind_mw": 68000 },
      ...
    ]
  }
```

#### Location-Specific Data

```
GET /api/location/{state}/{zip}
  Response: {
    "electricity_rate": 0.128,            # $/kWh for this location
    "solar_resource": 5.2,                # kWh/m2/day
    "wind_resource": 6.8,                 # m/s average wind speed
    "updated_at": "2026-04-07T18:00:00Z"
  }
```

#### Financial Calculations

```
POST /api/calculate
  Request: {
    "type": "solar",                      # or "wind"
    "size_kw": 50,
    "location_state": "CA",
    "location_zip": "94301",
    "capacity_factor": 0.25,
    "cost_per_watt": 2.50,
    "om_cost_percent": 0.015,
    "electricity_rate": 0.15,
    "rate_escalation": 0.025,
    "debt_percent": 0.6,
    "interest_rate": 0.05,
    "term_years": 25,
    "itc_percent": 0.30,
    "ptc": 0
  }
  Response: {
    "total_cost": 125000,                 # $
    "annual_production": 131250,          # kWh
    "annual_revenue": 19687,              # $ (year 1)
    "irr": 0.088,                         # 8.8%
    "npv": 145000,                        # $ (PV of cash flows)
    "lcoe": 0.0673,                       # $/kWh levelized cost
    "payback_years": 8.2,
    "cashflow_10yr": [...]                # Array of annual cash flows
  }
```

#### AI Research Context

```
GET /api/research/context
  Response: {
    "market_snapshot": { ... },           # Current market data
    "calculator_state": { ... },          # User's current scenario
    "timestamp": "2026-04-07T18:00:00Z"
  }

POST /api/chat
  Request: {
    "message": "What's the best state for solar?",
    "context": { ... }                    # Market + calculator data
  }
  Response: {
    "response": "Based on current market data...",
    "sources": ["EIA", "NREL"]
  }
```

### Caching Strategy

- Market data: 300s TTL (changes infrequently)
- Location data: 3600s TTL (changes very infrequently)
- Calculations: No cache (user-driven, instant)
- API calls: Deduplicate within TTL window

---

## Frontend Architecture (React + Vite)

### Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Tab1_Market.jsx
│   │   ├── Tab2_Calculator.jsx
│   │   ├── Tab3_Research.jsx
│   │   ├── Tab4_Map.jsx
│   │   └── shared/
│   │       ├── ChartContainer.jsx
│   │       ├── InputForm.jsx
│   │       └── LoadingState.jsx
│   ├── api/
│   │   ├── client.js                  # axios instance + helpers
│   │   ├── market.js
│   │   ├── calculator.js
│   │   ├── location.js
│   │   └── research.js
│   ├── App.jsx                        # Tab router + shared state
│   └── App.css
├── index.html
├── vite.config.js
└── package.json
```

### Component Hierarchy

```
App (Tab Router + App State)
├── Tab 1: Market Overview
│   ├── MarketSummary (cards)
│   ├── PriceTrendChart
│   └── CapacityByFuelChart
├── Tab 2: Project Calculator
│   ├── InputForm
│   ├── OutputMetrics
│   ├── CashflowChart
│   └── ScenarioToggle
├── Tab 3: Research Assistant
│   ├── ChatHistory
│   ├── MessageInput
│   └── ResearchContext
└── Tab 4: Geographic Map
    ├── USMapWithOverlays
    ├── StateDetail
    └── DataOverlayToggle
```

### Shared App State

```javascript
// Managed via React Context / useState
{
  // Market data (loaded once)
  market: {
    prices: [...],
    capacity: {...},
    rankings: [...]
  },

  // Calculator state (flows to Tab 1, 3, 4)
  calculator: {
    type: "solar",
    size_kw: 50,
    location_state: "CA",
    location_zip: "94301",
    results: { irr, npv, lcoe, ... }
  },

  // Map state (flows to Tab 2)
  selectedLocation: {
    state: "CA",
    zip: "94301",
    rates: 0.128,
    solar_resource: 5.2
  },

  // Research context
  research: {
    messages: [...],
    loading: false
  }
}
```

### Cross-Tab Data Flow Examples

**Flow 1: Map → Calculator**
- User clicks on California in Tab 4 (Map)
- `selectedLocation` state updates
- Tab 2 (Calculator) auto-populates location fields
- User can immediately recalculate with new location data

**Flow 2: Calculator → Market Overview**
- User enters project scenario in Tab 2
- Results generate (IRR, NPV, etc.)
- Tab 1 compares to market baseline (e.g., "Your IRR: 8.8% vs Market Avg: 7.2%")

**Flow 3: Calculator + Market → AI Research**
- User asks question in Tab 3
- AI receives: market data + user's calculator scenario
- AI provides context-aware answer with numbers

---

## Data Integration

### Public APIs Used

| API | Purpose | Integration Point |
|-----|---------|-------------------|
| **EIA Open Data** | Electricity prices, capacity by state | Backend `/api/market/` |
| **NREL PVWatts** | Solar production estimates | Backend `/api/calculate/` |
| **NREL Wind Toolkit** | Wind resource data | Backend `/api/location/` |
| **OpenEI** | Utility rates by zip | Backend `/api/location/` |
| **Anthropic Claude** | AI research assistant | Backend `/api/chat/` |

### Error Handling

- **API failures**: Return cached data or graceful error message
- **Rate limits**: Queue requests, show "Loading..." state
- **Invalid location**: Fallback to state average rates
- **Network offline**: Show stale data with timestamp, disable live refresh

---

## Deployment Architecture

### Frontend (Vercel/Netlify/Cloudflare Pages)

```
- Deploy from GitHub main branch
- Environment variables: VITE_API_URL=https://api.example.com
- Auto-deploy on push
- CDN caching: 60s for HTML, 1 year for /dist
```

### Backend (Render/Railway/Heroku)

```
- Deploy from GitHub main branch
- Environment variables: ANTHROPIC_API_KEY, EIA_API_KEY, etc.
- Auto-deploy on push
- Python 3.10+, Uvicorn
- Health check: GET / returns 200
```

### Environment Variables

Never commit `.env` files. Set in hosting platform dashboard:

**Backend:**
- `ANTHROPIC_API_KEY` - Claude API key
- `EIA_API_KEY` - EIA Open Data key
- `NREL_API_KEY` - NREL key
- `FRED_API_KEY` - Optional FRED key

**Frontend:**
- `VITE_API_URL` - Backend URL (e.g., https://api.example.com)

---

## Performance Considerations

- **Chart.js configs**: Limit data points to last 24 months for smooth rendering
- **Map rendering**: Use vector tiles, lazy-load state data
- **API calls**: Batch requests where possible, cache aggressively
- **Calculator**: All math runs client-side (instant updates)
- **AI responses**: Show streaming text if response is >500 chars

---

## Testing Strategy

- **Unit tests**: Calculator financial formulas (IRR, NPV, LCOE)
- **Integration tests**: API endpoints with mock data
- **E2E**: Cross-tab data flow (Map → Calculator → Market)
- **Manual**: Live API testing before deployment

---

## Future Improvements (Post-Hackathon)

- Add WebSocket for real-time price updates
- Implement user accounts + saved scenarios
- Add database for scenario history
- Expand to wind + hybrid projects
- Add sensitivity analysis heat maps
- PDF export with project summary
