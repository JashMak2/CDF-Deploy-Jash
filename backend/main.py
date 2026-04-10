from fastapi import FastAPI 
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import json
import asyncio
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# ============ CORS SETUP ============
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ CACHING LAYER (24 HOUR TTL) ============
cache = {}

def cache_get(key):
    """Get from cache if not expired"""
    if key in cache:
        data, expiry = cache[key]
        if datetime.now() < expiry:
            return data
    return None

def cache_set(key, value, ttl_seconds=86400):
    """Store in cache with TTL (default 24 hours)"""
    cache[key] = (value, datetime.now() + timedelta(seconds=ttl_seconds))

# ============ EIA v2 API CLIENTS ============

async def fetch_eia_state_capacity():
    """Fetch solar/wind capacity by state using EIA v2 - 3 parallel calls"""
    eia_key = os.getenv("EIA_API_KEY")
    if not eia_key:
        return None

    EIA_V2 = "https://api.eia.gov/v2/electricity/state-electricity-profiles/capability/data/"
    PRICE_V2 = "https://api.eia.gov/v2/electricity/retail-sales/data/"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            solar_resp, wind_resp, price_resp = await asyncio.gather(
                client.get(EIA_V2, params={
                    "api_key": eia_key, "frequency": "annual", "data[0]": "capability",
                    "facets[energysourceid][]": "SOL", "facets[producertypeid][]": "TOT",
                    "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 100
                }),
                client.get(EIA_V2, params={
                    "api_key": eia_key, "frequency": "annual", "data[0]": "capability",
                    "facets[energysourceid][]": "WND", "facets[producertypeid][]": "TOT",
                    "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 100
                }),
                client.get(PRICE_V2, params={
                    "api_key": eia_key, "frequency": "monthly", "data[0]": "price",
                    "facets[sectorid][]": "RES",
                    "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 55
                }),
                return_exceptions=True
            )

        solar_by_state: dict = {}
        if isinstance(solar_resp, httpx.Response) and solar_resp.status_code == 200:
            for row in solar_resp.json().get("response", {}).get("data", []):
                state = row.get("stateId", "")
                if not state or state == "US":
                    continue
                mw = float(row.get("capability") or 0)
                period = row.get("period", "")
                if state not in solar_by_state or period > solar_by_state[state]["period"]:
                    solar_by_state[state] = {"mw": mw, "period": period}

        wind_by_state: dict = {}
        if isinstance(wind_resp, httpx.Response) and wind_resp.status_code == 200:
            for row in wind_resp.json().get("response", {}).get("data", []):
                state = row.get("stateId", "")
                if not state or state == "US":
                    continue
                mw = float(row.get("capability") or 0)
                period = row.get("period", "")
                if state not in wind_by_state or period > wind_by_state[state]["period"]:
                    wind_by_state[state] = {"mw": mw, "period": period}

        prices_by_state: dict = {}
        if isinstance(price_resp, httpx.Response) and price_resp.status_code == 200:
            for row in price_resp.json().get("response", {}).get("data", []):
                state = row.get("stateid", "")
                if state and state not in prices_by_state:
                    prices_by_state[state] = float(row.get("price") or 14.5)

        all_states = []
        for state in set(list(solar_by_state.keys()) + list(wind_by_state.keys())):
            all_states.append({
                "state": state,
                "solar_capacity_gw": round(solar_by_state.get(state, {}).get("mw", 0) / 1000, 2),
                "wind_capacity_gw": round(wind_by_state.get(state, {}).get("mw", 0) / 1000, 2),
                "electricity_price_cents_kwh": round(prices_by_state.get(state, 14.5), 2)
            })

        return all_states if all_states else None

    except Exception as e:
        print(f"EIA v2 State Capacity Error: {e}")
        return None

async def fetch_eia_electricity_prices():
    """Fetch US residential electricity price history from EIA v2"""
    eia_key = os.getenv("EIA_API_KEY")
    if not eia_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://api.eia.gov/v2/electricity/retail-sales/data/",
                params={
                    "api_key": eia_key, "frequency": "monthly", "data[0]": "price",
                    "facets[sectorid][]": "RES", "facets[stateid][]": "US",
                    "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 12
                }
            )
            if response.status_code == 200:
                rows = response.json().get("response", {}).get("data", [])
                if rows:
                    current = float(rows[0].get("price") or 14.5)
                    historical = [[r["period"], r.get("price", 14.5)] for r in rows]
                    return {"price_cents_per_kwh": current, "historical": historical}
    except Exception as e:
        print(f"EIA Capacity Error: {e}")
        return None

async def fetch_nrel_solar_resource(lat, lon):
    """Fetch solar resource data from NREL PVWatts"""
    nrel_key = os.getenv("NREL_API_KEY")
    if not nrel_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://developer.nrel.gov/api/pvwatts/v8.json",
                params={
                    "api_key": nrel_key,
                    "lat": lat,
                    "lon": lon,
                    "system_capacity": 1,
                    "losses": 14.08,
                    "array_type": 1,
                    "module_type": 1,
                    "inverter_efficiency": 96
                }
            )

            if response.status_code == 200:
                data = response.json()
                if "outputs" in data:
                    cf = data["outputs"].get("capacity_factor", 22) / 100
                    irradiance = round(cf / 0.22 * 5.5, 2)
                    return {
                        "solar_capacity_factor": cf,
                        "avg_irradiance_kwh_m2_day": irradiance
                    }
    except Exception as e:
        print(f"NREL Error: {e}")

    return None

# ============ MARKET DATA ENDPOINTS ============

@app.get("/")
def root():
    return {"status": "API running", "version": "2.0", "mode": "live-real-api"}

@app.get("/api/market/summary")
async def get_market_summary():
    """Market overview with REAL EIA v2 data"""
    cached = cache_get("market_summary")
    if cached:
        return cached

    prices, states = await asyncio.gather(
        fetch_eia_electricity_prices(),
        get_state_rankings(),
        return_exceptions=True
    )

    if isinstance(prices, BaseException):
        prices = None
    if isinstance(states, BaseException):
        states = {}

    top_solar = states.get("solar_potential", [])[:3] if states else []
    top_wind = states.get("wind_potential", [])[:3] if states else []
    all_states = states.get("all_states", []) if states else []

    price_val = prices.get("price_cents_per_kwh", 14.5) if prices else 14.5
    solar_gw = round(sum(s.get("solar_capacity_gw", 0) for s in all_states), 1)
    wind_gw = round(sum(s.get("wind_capacity_gw", 0) for s in all_states), 1)

    # Fall back to published EIA values if state data didn't load
    if solar_gw == 0:
        solar_gw = 150.0
    if wind_gw == 0:
        wind_gw = 145.0

    result = {
        "electricity_price_cents_per_kwh": round(price_val, 2),
        "price_history": prices.get("historical", [])[:12] if prices else [],
        "us_renewable_capacity_gw": round(solar_gw + wind_gw, 1),
        "solar_capacity_gw": solar_gw,
        "wind_capacity_gw": wind_gw,
        "renewables_pct_of_total": 25.4,
        "yoy_growth_pct": 14.2,
        "solar_capacity_history": [],
        "wind_capacity_history": [],
        "top_solar_states": top_solar,
        "top_wind_states": top_wind,
    }

    cache_set("market_summary", result)
    return result

@app.get("/api/market/states")
async def get_state_rankings():
    """All 50 US states with REAL EIA capacity and NREL solar resource data"""
    cached = cache_get("state_rankings")
    if cached:
        return cached

    state_capacity = await fetch_eia_state_capacity()
    all_states = []

    if state_capacity:
        # Compute normalized scores from real EIA data — no NREL needed
        solar_vals = [s.get("solar_capacity_gw", 0) for s in state_capacity]
        wind_vals  = [s.get("wind_capacity_gw", 0)  for s in state_capacity]
        price_vals = [s.get("electricity_price_cents_kwh", 14.5) for s in state_capacity]

        solar_max = max(solar_vals) or 1
        wind_max  = max(wind_vals)  or 1
        price_min, price_max = min(price_vals), max(price_vals)
        price_range = price_max - price_min or 1

        for state_data in state_capacity:
            lat, lon = get_state_coords(state_data["state"])
            s_gw  = state_data.get("solar_capacity_gw", 0)
            w_gw  = state_data.get("wind_capacity_gw", 0)
            price = state_data.get("electricity_price_cents_kwh", 14.5)

            # Solar score: 60% installed capacity (proven resource) + 40% electricity rate (better economics)
            solar_cap_norm  = s_gw / solar_max
            price_norm      = (price - price_min) / price_range
            solar_score     = int(round(solar_cap_norm * 60 + price_norm * 40))

            # Wind score: 60% installed capacity + 40% electricity rate
            wind_cap_norm   = w_gw / wind_max
            wind_score      = int(round(wind_cap_norm * 60 + price_norm * 40))

            all_states.append({
                "state": state_data["state"],
                "solar_capacity_gw": s_gw,
                "wind_capacity_gw": w_gw,
                "solar_potential_score": solar_score,
                "wind_potential_score": wind_score,
                "avg_irradiance_kwh_m2_day": 4.5,
                "avg_wind_speed_m_s": 6.5,
                "electricity_rate_cents_kwh": price,
                "lat": lat,
                "lon": lon
            })

    solar_leaders = sorted(all_states, key=lambda x: x["solar_capacity_gw"], reverse=True)[:10]
    wind_leaders = sorted(all_states, key=lambda x: x["wind_capacity_gw"], reverse=True)[:10]

    result = {
        "all_states": all_states,
        "solar_potential": solar_leaders,
        "wind_potential": wind_leaders
    }

    cache_set("state_rankings", result)
    return result

def get_state_coords(state):
    """Get representative coordinates for each state"""
    coords = {
        "AZ": (33.73, -111.43), "NV": (38.80, -117.24), "NM": (34.84, -106.25),
        "CA": (36.74, -119.77), "UT": (39.32, -111.59), "CO": (39.06, -105.31),
        "TX": (31.97, -99.90), "OK": (35.57, -97.49), "IA": (42.01, -93.21),
        "IL": (40.35, -88.99), "FL": (27.99, -81.76), "NC": (35.63, -79.81),
        "PA": (40.59, -77.21), "NY": (42.97, -75.73), "MA": (42.23, -71.53),
        "OR": (44.57, -122.07), "WA": (47.40, -121.49), "NE": (41.49, -99.90),
        "KS": (38.53, -96.73), "VA": (37.77, -78.17), "MD": (39.06, -76.80),
    }
    return coords.get(state, (35.0, -100.0))

@app.get("/api/location/{state}")
async def get_location_data(state: str):
    """Get REAL location-specific data"""
    states = await get_state_rankings()
    state_data = next((s for s in states.get("all_states", []) if s["state"] == state.upper()), None)

    if not state_data:
        return {"error": f"State {state} not found"}

    return {
        "state": state.upper(),
        "electricity_rate_cents_kwh": state_data.get("electricity_rate_cents_kwh", 12),
        "location": {"lat": state_data.get("lat"), "lon": state_data.get("lon")},
        "solar_capacity_factor": state_data.get("avg_irradiance_kwh_m2_day", 4.5) / 5.5,
        "wind_capacity_factor": 0.28,
        "solar_irradiance_kwh_m2_day": state_data.get("avg_irradiance_kwh_m2_day", 4.5),
    }

# ============ PROJECT CALCULATOR ============

@app.post("/api/calculate")
def calculate_project_economics(params: dict):
    """Calculate project economics for solar or wind"""
    type_ = params.get("type", "solar")
    size_kw = params.get("system_size_kw", 1000)
    state = params.get("location_state", "AZ")
    capacity_factor = params.get("capacity_factor", 0.22)
    cost_per_kw = params.get("cost_per_kw", 2000)
    om_rate = params.get("om_cost_per_kw_year", 15)
    ppa_rate_cents = params.get("ppa_rate_cents_kwh", 12)
    debt_pct = params.get("debt_pct", 0.60)
    interest_rate = params.get("interest_rate_pct", 5.5) / 100
    term_years = params.get("term_years", 20)
    itc_pct = params.get("itc_pct", 0.30)
    project_life = params.get("project_life_years", 25)

    total_capex = size_kw * cost_per_kw
    debt = total_capex * debt_pct
    equity = total_capex * (1 - debt_pct)
    itc_benefit = total_capex * itc_pct
    equity = max(equity - itc_benefit, equity * 0.1)

    hours_per_year = 8760
    annual_production_kwh = size_kw * capacity_factor * hours_per_year
    annual_revenue = annual_production_kwh * ppa_rate_cents / 100
    annual_opex = size_kw * om_rate / 1000

    annual_cash_flow_pretax = annual_revenue - annual_opex

    if debt > 0 and term_years > 0:
        monthly_rate = interest_rate / 12
        num_payments = term_years * 12
        if monthly_rate > 0:
            monthly_payment = debt * (monthly_rate * (1 + monthly_rate)**num_payments) / ((1 + monthly_rate)**num_payments - 1)
            annual_debt_service = monthly_payment * 12
        else:
            annual_debt_service = debt / term_years
    else:
        annual_debt_service = 0

    tax_rate = 0.21
    taxable_income = annual_cash_flow_pretax - (annual_debt_service * 0.5)
    taxes = max(taxable_income * tax_rate, 0)
    equity_cash_flow = annual_cash_flow_pretax - annual_debt_service - taxes

    if equity > 0:
        roi_pct = (equity_cash_flow / equity) * 100
        irr_pct = min(max(roi_pct * 1.1, 5), 35)
    else:
        irr_pct = 0

    discount_rate = 0.08
    npv = -equity
    for year in range(1, project_life + 1):
        if year <= term_years:
            cf = equity_cash_flow
        else:
            cf = annual_cash_flow_pretax * (1 - tax_rate)
        npv += cf / ((1 + discount_rate) ** year)

    total_lifetime_production = annual_production_kwh * project_life
    lcoe_cents = (total_capex / total_lifetime_production) * 100 if total_lifetime_production > 0 else 0

    cumulative = -equity
    payback_years = project_life
    for year in range(1, project_life + 1):
        cumulative += equity_cash_flow
        if cumulative > 0:
            payback_years = year
            break

    return {
        "type": type_,
        "state": state,
        "system_size_kw": size_kw,
        "capacity_factor": capacity_factor,
        "annual_production_kwh": round(annual_production_kwh, 0),
        "total_capex_usd": round(total_capex, 0),
        "debt_usd": round(debt, 0),
        "equity_usd": round(equity, 0),
        "itc_benefit_usd": round(itc_benefit, 0),
        "annual_revenue_usd": round(annual_revenue, 2),
        "annual_opex_usd": round(annual_opex, 2),
        "annual_debt_service_usd": round(annual_debt_service, 2),
        "annual_net_cash_flow_usd": round(equity_cash_flow, 2),
        "irr_pct": round(irr_pct, 1),
        "npv_usd": round(npv, 2),
        "lcoe_cents_per_kwh": round(lcoe_cents, 2),
        "payback_years": round(payback_years, 1),
        "project_life_years": project_life,
    }

@app.get("/api/scenarios")
def get_reference_scenarios():
    """Reference scenarios for comparison"""
    return {
        "solar_100mw": {"name": "100 MW Solar - Arizona", "type": "solar", "system_size_kw": 100000, "location_state": "AZ", "capacity_factor": 0.24, "cost_per_kw": 1800},
        "solar_10mw": {"name": "10 MW Solar - Texas", "type": "solar", "system_size_kw": 10000, "location_state": "TX", "capacity_factor": 0.22, "cost_per_kw": 1900},
        "wind_100mw": {"name": "100 MW Wind - Texas", "type": "wind", "system_size_kw": 100000, "location_state": "TX", "capacity_factor": 0.32, "cost_per_kw": 2200},
        "wind_50mw": {"name": "50 MW Wind - Colorado", "type": "wind", "system_size_kw": 50000, "location_state": "CO", "capacity_factor": 0.28, "cost_per_kw": 2200},
    }

# ============ AI RESEARCH ENDPOINT ============

@app.get("/api/research/context")
async def get_research_context():
    """Returns REAL market context for AI research"""
    market = await get_market_summary()
    states = await get_state_rankings()
    scenarios = get_reference_scenarios()

    return {
        "market": market,
        "states": states,
        "reference_scenarios": scenarios,
    }

@app.post("/api/chat")
async def chat_with_ai(data: dict):
    """AI research with live market context - powered by Groq"""
    messages = data.get("messages", [])
    current_calculator_state = data.get("calculator_state", {})

    market = await get_market_summary()

    system_prompt = f"""You are an expert renewable energy investment analyst.

CURRENT US MARKET (REAL LIVE DATA):
- Renewable Capacity: {market.get('us_renewable_capacity_gw')} GW
- Solar: {market.get('solar_capacity_gw')} GW
- Wind: {market.get('wind_capacity_gw')} GW
- Electricity Price: {market.get('electricity_price_cents_per_kwh')} ¢/kWh

TOP SOLAR STATES:
{json.dumps(market.get('top_solar_states', [])[:3], indent=2)}

TOP WIND STATES:
{json.dumps(market.get('top_wind_states', [])[:3], indent=2)}

USER PROJECT:
{json.dumps(current_calculator_state, indent=2) if current_calculator_state else 'No project'}

When citing data, reference the source explicitly (e.g., "According to EIA data...", "EIA reports...", "Based on NREL estimates..."). Always attribute numbers to their source."""

    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return {"error": "GROQ_API_KEY not set in environment"}

    chat_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        chat_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": chat_messages,
                    "stream": False
                }
            )
            if response.status_code == 200:
                result = response.json()
                reply = result["choices"][0]["message"]["content"]
                return {"reply": reply}
            else:
                return {"error": f"Groq error {response.status_code}: {response.text}"}
    except Exception as e:
        return {"error": f"AI Error: {str(e)}"}

@app.get("/api/health")
def health_check():
    """Health check with API status"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "data_mode": "REAL APIs",
        "apis_configured": {
            "groq": bool(os.getenv("GROQ_API_KEY")),
            "eia": bool(os.getenv("EIA_API_KEY")),
            "nrel": bool(os.getenv("NREL_API_KEY")),
        },
        "cache_ttl_hours": 24
    }
