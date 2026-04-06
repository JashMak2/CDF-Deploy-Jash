# CDF AI Engineering Hackathon

**U.S. Renewable Energy Investment Dashboard**

**Version:** 1.0
**Deadline:** April 12, 2026 at 1:00 PM EST
**Format:** Take-home project + 5-minute walkthrough video

---

## About This Hackathon

CDF is running this hackathon to identify strong AI engineering talent. This challenge is designed to test your ability to use AI coding tools (Claude, Cursor, Copilot, or similar) alongside strong software engineering fundamentals to build production-grade applications.

Your task is to build a **multi-tab investment analysis dashboard** focused on U.S. renewable energy projects, using only **publicly available data**.

**What we're evaluating:**

| Dimension | Weight | What we're looking for |
|-----------|--------|----------------------|
| AI Integration & Usage | 25% | Meaningful AI features (not just API wrappers). Show us you can make AI genuinely useful for analysis. |
| Technical Architecture | 25% | Clean code structure, sensible data flow between components, good state management. |
| UI/UX & Data Visualization | 20% | Clear, functional interface. Charts, tables, and maps that help users understand data. |
| Data Engineering | 15% | Successfully pulling from multiple public APIs, normalizing data, handling errors gracefully. |
| Project Management & Process | 15% | Your planning document, prioritization decisions, git history, and documentation. |

---

## The Challenge

Build a **Renewable Energy Project Analysis Dashboard** - a web application with multiple tabs that helps an investment analyst evaluate solar and wind energy opportunities across the United States.

The dashboard should pull live data from public APIs, perform financial calculations, visualize geographic data, and include AI-powered analysis features.

**You are free to choose any tech stack.** Use whatever frameworks, languages, and tools you're most productive with. We care about the result, not the specific tools - though we expect you to justify your choices in your planning document.

---

## Requirements

### Tier 1 - Core Requirements (Must Complete)

These are the minimum expectations. Completing Tier 1 well is better than completing Tier 2 poorly.

#### Tab 1: Market Overview (Status Dashboard)

An at-a-glance summary of the U.S. renewable energy market.

**Must include:**
- Key market metrics pulled from at least one public API (e.g., national average electricity price, total installed solar/wind capacity, year-over-year growth)
- A visual status section - cards, gauges, or summary boxes showing current market state
- At least one chart (e.g., electricity price trends over time, capacity growth by year)

**Data sources (suggested):**
- [EIA Open Data API](https://www.eia.gov/opendata/) - electricity prices, generation, capacity by state
- [FRED API](https://fred.stlouisfed.org/docs/api/fred/) - economic indicators (interest rates, inflation)

#### Tab 2: Project Economics Calculator

An interactive financial model for a renewable energy project (solar or wind - pick one or support both).

**Must include:**
- Editable input panel with project parameters:
  - System size (kW/MW), capacity factor, degradation rate
  - Installation cost ($/W), O&M costs
  - Electricity selling rate, annual escalation
  - Financing terms (debt %, interest rate, term)
  - Federal ITC/PTC assumptions
- Calculated output panel showing:
  - Total project cost, annual energy production
  - Annual revenue, operating costs, net operating income
  - Key return metrics: IRR, NPV, payback period, LCOE
- Scenario support: at minimum a base case and one alternative (e.g., "optimistic" / "conservative")
- At least one visualization of the financial outputs (cash flow chart, waterfall, or similar)

**Key technical requirement:** Calculations should run client-side and update instantly when inputs change. Do not round-trip to a server for every recalculation.

#### Tab 3: Research Assistant (AI-Powered)

An AI-powered research and Q&A feature that helps analysts investigate renewable energy topics.

**Must include:**
- A conversational interface where users can ask questions about renewable energy markets, project economics, policy, or technology
- The AI must have access to context beyond its training data - at minimum, feed it data you've pulled from public APIs so it can answer questions grounded in current numbers
- Responses should cite or reference their data sources
- Conversation history should persist within a session

**What we're really evaluating here:**
- How you architect the AI integration (context management, prompt engineering, retrieval strategy)
- Whether the AI adds genuine analytical value vs. just echoing back what you sent it
- How you handle the boundary between AI-generated content and verified data

#### Tab 4: Geographic Visualization

A map showing renewable energy data with geographic context.

**Must include:**
- An interactive map (Google Maps, Mapbox, Leaflet, or similar)
- Data points plotted on the map from a public source (e.g., solar irradiance by region, existing project locations, electricity prices by state)
- Clickable markers or regions that show detail on interaction
- At least one data overlay that helps users compare regions

**Data sources (suggested):**
- [NREL Solar Resource Data](https://developer.nrel.gov/) - PVWatts API for solar potential by location
- [EIA State Energy Data](https://www.eia.gov/opendata/) - electricity data by state
- [EPA FLIGHT](https://ghgdata.epa.gov/ghgp/main.do) - emissions by facility (for offset analysis context)

#### Cross-Tab Data Flow

At least **two instances** where data flows between tabs:
- Example: The Project Economics calculator uses a location-specific electricity rate pulled from the Geographic tab's dataset
- Example: The Market Overview shows a summary metric calculated by the Project Economics tab
- Example: The Research Assistant has access to the user's current scenario inputs when answering questions

This is critical. Tabs that are completely siloed show a gap in architecture thinking.

#### Deployment

**This is mandatory.** Deploy your application to a public URL before the deadline. All evaluations are done against your live site - there is no local review.

- Use any free hosting platform: Vercel, Netlify, Cloudflare Pages, Railway, or similar
- Set your API keys as environment variables in your hosting platform's dashboard - **never commit keys to the repo**
- Your live URL must be working and accessible at the deadline. A broken or blank deployment is treated the same as no submission
- Add the URL prominently at the top of your README

#### Planning Document

Before you start coding (or as your first commit), write a brief planning document:
- Your tech stack choices and why
- How you'll break the work into phases given the time constraint
- What you'll prioritize and what you'll cut if time runs short
- Architecture overview (how data flows between components)

**This is not a formality.** We read it. It tells us how you think about problems before you code.

---

### Tier 2 - Stretch Goals (Differentiators)

These are not required but will significantly strengthen your submission. Pick the ones that showcase your strengths.

#### Data Provenance

Make data points in your dashboard **traceable**. When a user sees a number (e.g., "$0.12/kWh" or "32% capacity factor"), they should be able to click or hover to see:
- Where the number came from (which API, which calculation)
- When it was last updated
- A brief description of what it represents

#### Export Capabilities

Add the ability to export analysis as:
- **PDF or PowerPoint** - a formatted report summarizing the project economics and market data
- **Excel** - a formula-driven workbook where inputs remain editable (not just a data dump)

#### Sensitivity Analysis

Add a sensitivity view to the Project Economics tab:
- Heat map or matrix showing how returns change across two input variables (e.g., electricity price vs. capacity factor)
- Color-coded cells indicating return quality (red = poor, green = strong)

#### Additional AI Features

Go beyond basic Q&A:
- **Auto-generated project summary** - AI writes a 1-page investment summary based on the current calculator inputs and market data
- **Comparison analysis** - AI compares two regions or project configurations and explains tradeoffs
- **Data anomaly detection** - AI flags when pulled data looks unusual compared to historical patterns

#### Live Data Refresh

Make at least one data source refresh on a schedule or on-demand (not just loaded once at page load). Show loading states, last-updated timestamps, and graceful handling of API failures.


---

### Tier 3 - Exceptional (Surprise Us)

We're not going to prescribe what "exceptional" looks like - that's the point. If you have time and ideas, show us something we didn't ask for.

---

## Public Data Sources - Quick Reference

| Source | URL | What it provides | Auth |
|--------|-----|-------------------|------|
| **EIA Open Data** | api.eia.gov | Electricity prices, generation, capacity, consumption by state and fuel type | Free API key |
| **NREL Developer APIs** | developer.nrel.gov | PVWatts (solar calculator), solar resource data, utility rates, wind toolkit | Free API key |
| **FRED** | api.stlouisfed.org | Interest rates, inflation, economic indicators | Free API key |
| **OpenEI Utility Rates** | openei.org/wiki/Utility_Rate_Database | Utility rate structures by zip code | Open data |
| **DSIRE** | dsireusa.org | State renewable energy incentives and policies | Open data |
| **EPA FLIGHT** | ghgdata.epa.gov | Greenhouse gas emissions by facility | Open data |
| **Google Maps / Mapbox** | Various | Maps, geocoding, visualization | Free tier |
| **OpenWeatherMap** | openweathermap.org | Weather and climate data | Free tier |

---

## What to Submit

All submissions are made by pushing to your GitHub Classroom repository. There is nothing to email or send separately - your repo state at the deadline is your submission.

Before **April 12, 2026 at 1:00 PM EST**, make sure your repo contains:

1. **Your code** committed and pushed with a clean commit history
2. **Planning document** completed in `planning/PLANNING.md`
3. **Updated README** with your live URL at the top, architecture overview, and reflections
4. **Live deployment URL** - mandatory. Must be functional at the deadline
5. **Walkthrough video** (5 minutes) - record a short demo walking through your live dashboard and key technical decisions. Link it in your README.

---

## Evaluation Rubric

### Good
- All Tier 1 requirements are functional
- At least 2 public APIs successfully integrated
- AI feature adds genuine value
- Code is organized and readable
- Planning document exists and reflects actual execution

### Great
Everything above, plus 2+ Tier 2 features, clean cross-tab data flow, thoughtful AI prompt engineering, and strong data visualizations.

### Outstanding
Everything above, plus novel approaches, production-quality code, and documentation a new team member could onboard from.

---

## Rules & Guidelines

1. **Use any AI coding tools.** Document your usage in the README.
2. **Free data sources only.** All suggested sources have free tiers.
3. **Keep AI API spend under $10** if using a paid provider. API costs are your own responsibility - stick to free tiers where possible (all suggested sources have them).
4. **No proprietary data.** Everything must come from public sources.
5. **Deadline is firm.** A well-built Tier 1 beats a rushed attempt at everything.

---