# Reflection & Technical Decisions

## What We Built

A 4-tab renewable energy investment dashboard that integrates live public APIs (EIA, NREL) with AI-powered research and financial modeling. The application helps investment analysts evaluate solar and wind project opportunities across the U.S.

### Tier 1 Requirements Met

- ✅ **Tab 1 (Market Overview)** - Live electricity prices, capacity by fuel, national trends
- ✅ **Tab 2 (Project Calculator)** - Interactive solar/wind financial model with IRR, NPV, LCOE, cashflow visualization
- ✅ **Tab 3 (Research Assistant)** - Claude AI with live market data context, cites sources
- ✅ **Tab 4 (Geographic Map)** - US map with solar irradiance overlays, clickable states
- ✅ **Cross-Tab Data Flow** - 3+ instances: Map→Calculator (location), Calculator→Market (comparison), Calculator+Market→AI (context)
- ✅ **Clean Code & Architecture** - Modular components, separate API layer, shared state management
- ✅ **Planning & Documentation** - Detailed planning doc, architecture overview, README

---

## Tech Stack Justification

| Tech | Choice | Alternative Considered | Why We Chose It |
|------|--------|------------------------|----|
| **Frontend** | React 18 + Vite | Vue, Svelte | Largest ecosystem for financial dashboards; Chart.js & Leaflet mature. Vite for instant HMR during development. |
| **Backend** | Python FastAPI | Node.js Express, Go | Async by default; easier to integrate with Anthropic SDK. Fast startup. |
| **Maps** | Leaflet.js | Google Maps, Mapbox | Zero API key requirement (uses free OpenStreetMap). Lightweight. |
| **Charts** | Chart.js | Recharts, Plotly | Responsive, performant for financial data. Easy to style. |
| **AI** | Anthropic Claude | OpenAI GPT-4 | Free $5 credit; excellent reasoning for financial analysis. |
| **Deployment** | Vercel (FE) + Render (BE) | Firebase, AWS Amplify | Free tiers; simple GitHub integration; environment variable management. |

### Tech Stack Trade-offs

**Client-Side Calculations**
- ✅ **Pro**: Instant feedback, no server round-trips, works offline
- ❌ **Con**: Financial formulas must be verified (no server validation)
- **Decision**: Acceptable; hackathon prioritizes UX and speed

**Caching Strategy**
- ✅ **Pro**: Survives API rate limits, consistent UX
- ❌ **Con**: Data can be stale for fast-moving markets
- **Decision**: 300s TTL for market data is reasonable balance

**AI Context Size**
- ✅ **Pro**: AI has full market context + user scenario
- ❌ **Con**: If data is large, could exceed token limits
- **Decision**: Compress context to essential metrics only (prices, capacity, user inputs)

---

## Key Architectural Decisions

### 1. Shared App State (React Context)

```
App → (provides state) → All Tabs
```

**Why**: Simpler than Redux for a single-page app. Tabs need synchronized state (calculator results visible in market comparison, AI context, etc.).

**Alternative**: URL query params (would lose state on refresh) or Redux (overkill).

### 2. Backend Caching Layer

**Why**: EIA and NREL APIs have rate limits. Caching ensures robustness and fast response.

**Implementation**: In-memory cache with TTL (Python dict + timers). For production, would upgrade to Redis.

### 3. Instant Financial Calculations (Client-Side)

**Why**: Financial formulas are deterministic and visible. No server validation needed for hackathon.

**Security Note**: For production, would add server-side validation of user inputs.

### 4. Claude as Research Assistant

**Why**: Claude excels at reasoning over structured data. Prompt includes market data snapshot + user's calculator scenario.

**Prompt Strategy**:
- Few-shot examples of good energy analysis
- Explicit instruction to cite API sources
- Temperature: 0.7 (balanced between precision and creativity)

### 5. Cross-Tab Data Flow

**Design Decision**: Tabs share state instead of being isolated.

**Benefits**:
- Map click → Calculator pre-fill (realistic workflow)
- Calculator results → Market comparison (context-aware)
- Combined state → AI (richer analysis)

**Risk**: If state gets too complex, hard to debug. Mitigated with clear actions and logging.

---

## API Integration Details

### EIA Open Data
- **Used for**: Electricity prices, capacity by state, fuel mix
- **Challenge**: Large response sizes (all 50 states + historical data)
- **Solution**: Parse only needed states, cache in backend, last 12 months only

### NREL PVWatts
- **Used for**: Solar production estimate given location + system size
- **Challenge**: Slow API (can take 2-3s per request)
- **Solution**: Show loading spinner, cache results by location

### OpenEI Utility Rates
- **Used for**: Electricity rates by zip code
- **Challenge**: Sparse data (not all zips have rates)
- **Solution**: Fallback to state average if zip not found

### Anthropic Claude
- **Used for**: AI research assistant
- **Challenge**: Streaming responses can be slow
- **Solution**: Show streaming text, loading indicator
- **Cost**: ~200 requests × ~1000 tokens = ~$0.30/day (well under $10 free credits)

---

## AI Integration Specifics

### Prompt Design

The AI receives context:
```
{
  "market_data": {
    "national_avg_electricity_price": 0.145,
    "total_solar_capacity_mw": 153000,
    "total_wind_capacity_mw": 145000,
    "top_solar_states": [...]
  },
  "user_scenario": {
    "project_type": "solar",
    "size_kw": 50,
    "location": "California",
    "irr": 0.088,
    "npv": 145000,
    "lcoe": 0.0673
  }
}
```

Then ask: **"Based on the market data and the user's solar project scenario, what should they know?"**

### Why This Approach

- ✅ AI is grounded in actual data (no hallucinations)
- ✅ Users see where numbers come from
- ✅ Competitive advantage over generic chatbots

### AI Limitations

- ❌ Cannot search current news (uses training data + our context)
- ❌ May over-generalize from limited data
- **Mitigated**: Explicit instruction to cite sources, show confidence ("Based on current data...")

---

## What Worked Well

1. **React + Vite setup** - Hot reload made rapid iteration smooth
2. **FastAPI** - Async made juggling multiple API calls easy
3. **Client-side calculations** - Users immediately see IRR/NPV/LCOE as they adjust inputs
4. **Public APIs** - EIA + NREL have excellent free tiers
5. **Claude context management** - Simple JSON context approach scales well
6. **Git commits** - Frequent commits made progress trackable

---

## What Was Challenging

1. **API Rate Limits** - Had to implement caching layer even for hackathon
2. **Financial Formulas** - IRR requires Newton-Raphson iteration; had to be careful with edge cases
3. **Map Data** - US state boundaries + overlay data requires large JSON; optimized with TopoJSON
4. **AI Response Quality** - Early versions too generic; improved with specific prompt engineering
5. **Cross-Tab Responsibility** - Clear when Calculator updates should trigger Market refresh (kept separate)

---

## Decisions Made Under Time Pressure

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Leaflet instead of custom map | Good free tiles, less code | Less customization |
| In-memory cache instead of Redis | Simpler, no external dependency | Won't persist across server restarts |
| No user authentication | Out of scope, adds complexity | Can't save scenarios |
| Client-side calculations only | Instant feedback, simple | No server validation |
| Single AI model (Claude) | Free credits, time constraint | Could compare GPT-4 differently |
| Tab 4 state selector UI | Time pressure | Could be more sophisticated map interaction |

---

## What We'd Do Differently (Post-Hackathon)

1. **Add database** - Store scenarios, user calculations, export history
2. **Add authentication** - User accounts, scenario sharing
3. **Upgrade caching** - Redis instead of in-memory
4. **Add tests** - Unit tests for financial formulas, e2e for cross-tab flow
5. **Real-time data** - WebSocket updates for prices
6. **Sensitivity analysis** - Heat maps of IRR vs. capacity factor
7. **PDF export** - Professional investment summary reports

---

## AI Tools Used

| Tool | Purpose | Impact |
|------|---------|--------|
| **Claude (this conversation)** | Code generation, debugging, architecture | High - Accelerated component building, fixed financial formula bugs |
| **ChatGPT** | Researching API docs, financial formulas | Medium - Helped understand PVWatts parameters |
| **GitHub Copilot** | In-editor autocompletion | Medium - Reduced typing, caught some bugs |
| **Cursor/Claude Code** | File reading, refactoring, git integration | High - Streamlined workflow, reduced context switching |

**Total Development Time**: ~10-12 hours (April 7 full day)

---

## Lessons Learned

1. **Planning pays off** - Having architecture doc saved hours of refactoring
2. **Free APIs are reliable** - EIA + NREL are production-grade
3. **Client-side calculations rule** - No server latency = happy users
4. **AI excels at reasoning** - Claude's analysis of projects was insightful
5. **Cross-tab data flow is hard** - Worth planning upfront, not bolting on later
6. **Commit history tells a story** - Made debugging and reviewing progress clear

---

## How We Think About Production Readiness

**Hackathon (Current)**:
- ✅ Works end-to-end on desktop
- ✅ Handles happy path well
- ⚠️ Minimal error handling (API failures show alerts)
- ⚠️ No input validation on calculator
- ⚠️ No HTTPS enforcement, limited logging

**Production (Next Steps)**:
- [ ] Add comprehensive error handling
- [ ] Validate all inputs server-side
- [ ] Add authentication & RBAC
- [ ] HTTPS + CORS security audit
- [ ] Database for state persistence
- [ ] Monitoring & alerting
- [ ] Load testing

---

## Final Thoughts

This hackathon taught us that production-grade applications are built by:

1. **Clear architecture first** - Spending time planning saved chaos later
2. **User-focused features** - Client-side calculations beat perfect server design
3. **Pragmatic choices** - Leaflet + in-memory cache > building from scratch
4. **AI as a tool** - Claude accelerated both coding and analysis
5. **Incremental delivery** - Tier 1 complete + polished > incomplete Tier 2

**We built a real product that investors could use.**

---

**Built with ❤️ and Claude**

*Deadline: April 12, 2026 at 1:00 PM EST*
