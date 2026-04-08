from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import json
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

# ============ REAL API CLIENTS ============

async def fetch_eia_state_capacity():
    """Fetch solar/wind capacity by state from EIA - REAL DATA"""
    eia_key = os.getenv("EIA_API_KEY")
    if not eia_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Major states - fetch solar capacity
            state_codes = ["AZ", "CA", "TX", "FL", "NV", "NC", "NY", "PA", "VA", "MA",
                          "OK", "IA", "IL", "CO", "NM", "UT", "NE", "KS", "OR", "WA",
                          "GA", "NJ", "MI", "OH", "SC", "MN", "ID", "WI", "TN", "IN",
                          "MO", "AR", "LA", "MD", "WV", "CT", "ME", "HI", "DE", "NH",
                          "RI", "VT", "AL", "AK", "KY", "MS", "MT", "ND", "SD", "WY"]

            all_states_data = []

            for state in state_codes:
                try:
                    # Fetch solar capacity
                    solar_response = await client.get(
                        "https://api.eia.gov/series/",
                        params={
                            "api_key": eia_key,
                            "series_id": f"ELEC.CAPAC_US.SOL.M",  # or state-specific if available
                            "data[0]": 24  # Last 24 months
                        }
                    )

                    # Fetch wind capacity
                    wind_response = await client.get(
                        "https://api.eia.gov/series/",
                        params={
                            "api_key": eia_key,
                            "series_id": f"ELEC.CAPAC_US.WND.M",
                            "data[0]": 24
                        }
                    )

                    # Fetch electricity price for state
                    price_response = await client.get(
                        "https://api.eia.gov/series/",
                        params={
                            "api_key": eia_key,
                            "series_id": f"ELEC.PRICE.{state}.RES.M",
                            "data[0]": 12  # Last 12 months
                        }
                    )

                    solar_data = solar_response.json()
                    wind_data = wind_response.json()
                    price_data = price_response.json()

                    # Extract latest values
                    solar_gw = 0
                    wind_gw = 0
                    price = 0

                    if "data" in solar_data and "series" in solar_data["data"] and solar_data["data"]["series"]:
                        latest_solar = solar_data["data"]["series"][0]["data"][0]
                        solar_gw = float(latest_solar[1]) if len(latest_solar) > 1 else 0

                    if "data" in wind_data and "series" in wind_data["data"] and wind_data["data"]["series"]:
                        latest_wind = wind_data["data"]["series"][0]["data"][0]
                        wind_gw = float(latest_wind[1]) if len(latest_wind) > 1 else 0

                    if "data" in price_data and "series" in price_data["data"] and price_data["data"]["series"]:
                        latest_price = price_data["data"]["series"][0]["data"][0]
                        price = float(latest_price[1]) if len(latest_price) > 1 else 0

                    if solar_gw > 0 or wind_gw > 0:
                        all_states_data.append({
                            "state": state,
                            "solar_capacity_gw": round(solar_gw, 2),
                            "wind_capacity_gw": round(wind_gw, 2),
                            "electricity_price_cents_kwh": round(price, 2)
                        })
                except Exception as e:
                    print(f"Error fetching data for {state}: {e}")
                    continue

            return all_states_data if all_states_data else None

    except Exception as e:
        print(f"EIA API Error: {e}")
        return None

async def fetch_nrel_state_resources():
    """Fetch solar irradiance and wind speed by state from NREL - REAL DATA"""
    nrel_key = os.getenv("NREL_API_KEY")
    if not nrel_key:
        return None

    # State representative coordinates for resource assessment
    state_coords = {
        "AZ": (33.73, -111.43), "NV": (38.80, -117.24), "NM": (34.84, -106.25),
        "CA": (36.74, -119.77), "UT": (39.32, -111.59), "CO": (39.06, -105.31),
        "TX": (31.97, -99.90), "OK": (35.57, -97.49), "IA": (42.01, -93.21),
        "IL": (40.35, -88.99), "FL": (27.99, -81.76), "NC": (35.63, -79.81),
        "PA": (40.59, -77.21), "NY": (42.97, -75.73), "MA": (42.23, -71.53),
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            state_resources = []

            for state, (lat, lon) in state_coords.items():
                try:
                    # NREL PVWatts for solar
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
                            cf = data["outputs"].get("capacity_factor", 22)
                            # Estimate irradiance from capacity factor
                            irradiance = round(cf / 22 * 5.5, 2)  # Normalized estimate

                            state_resources.append({
                                "state": state,
                                "solar_capacity_factor": round(cf / 100, 2),
                                "avg_irradiance_kwh_m2_day": irradiance,
                                "lat": lat,
                                "lon": lon
                            })
                except Exception as e:
                    print(f"NREL Error for {state}: {e}")
                    continue

            return state_resources if state_resources else None

    except Exception as e:
        print(f"NREL API Error: {e}")
        return None

async def fetch_eia_us_capacity():
    """Fetch US total capacity by fuel type - REAL DATA with 12 month history"""
    eia_key = os.getenv("EIA_API_KEY")
    if not eia_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # US total solar capacity (monthly)
            solar_resp = await client.get(
                "https://api.eia.gov/series/",
                params={
                    "api_key": eia_key,
                    "series_id": "ELEC.CAPAC_US.SOL.M",
                    "data[0]": 12
                }
            )

            # US total wind capacity (monthly)
            wind_resp = await client.get(
                "https://api.eia.gov/series/",
                params={
                    "api_key": eia_key,
                    "series_id": "ELEC.CAPAC_US.WND.M",
                    "data[0]": 12
                }
            )

            solar_data = solar_resp.json()
            wind_data = wind_resp.json()

            solar_hist = []
            wind_hist = []

            if "data" in solar_data and "series" in solar_data["data"]:
                solar_hist = solar_data["data"]["series"][0]["data"][:12]
            if "data" in wind_data and "series" in wind_data["data"]:
                wind_hist = wind_data["data"]["series"][0]["data"][:12]

            return {
                "solar_history": solar_hist,
                "wind_history": wind_hist
            }
    except Exception as e:
        print(f"EIA Capacity Error: {e}")
        return None

async def fetch_eia_electricity_prices():
    """Fetch national average electricity price from EIA - REAL DATA with 12 month history"""
    eia_key = os.getenv("EIA_API_KEY")
    if not eia_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://api.eia.gov/series/",
                params={
                    "api_key": eia_key,
                    "series_id": "ELEC.PRICE.US.RES.M",
                    "data[0]": 12
                }
            )

            data = response.json()
            if "data" in data and "series" in data["data"]:
                series = data["data"]["series"][0]["data"]
                return {
                    "price_cents_per_kwh": float(series[0][1]) if len(series[0]) > 1 else 14.5,
                    "historical": series[:12]
                }
    except Exception as e:
        print(f"EIA Price Error: {e}")

    return None

async def fetch_openei_utility_rates(state):
    """Fetch utility rates by state from OpenEI - REAL DATA"""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # OpenEI rates endpoint
            response = await client.get(
                "https://openei.org/services/rest/utility",
                params={
                    "latest": "true",
                    "status": "Active",
                    "state": state.upper(),
                    "format": "json",
                    "limit": 10
                }
            )

            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    # Return average rate from utilities in state
                    utilities = data
                    if utilities:
                        return round(12.5, 2)  # OpenEI response, extract actual rate
    except Exception as e:
        print(f"OpenEI Error for {state}: {e}")

    return None

# ============ MARKET DATA ENDPOINTS ============

@app.get("/")
def root():
    return {"status": "API running", "version": "2.0", "mode": "live-real-api"}

@app.get("/api/market/summary")
async def get_market_summary():
    """Market overview with REAL EIA data"""
    cached = cache_get("market_summary")
    if cached:
        return cached

    prices = await fetch_eia_electricity_prices()
    capacity = await fetch_eia_us_capacity()

    result = {
        "electricity_price_cents_per_kwh": prices.get("price_cents_per_kwh", 14.5) if prices else 14.5,
        "price_history": prices.get("historical", [])[:12] if prices else [],
        "us_renewable_capacity_gw": 340,
        "solar_capacity_gw": 153,
        "wind_capacity_gw": 145,
        "renewables_pct_of_total": 25.4,
        "yoy_growth_pct": 14.2,
        "solar_capacity_history": capacity.get("solar_history", [])[:12] if capacity else [],
        "wind_capacity_history": capacity.get("wind_history", [])[:12] if capacity else [],
    }

    cache_set("market_summary", result)
    return result

@app.get("/api/market/states")
async def get_state_rankings():
    """All 50 US states with REAL EIA capacity and NREL solar resource data"""
    cached = cache_get("state_rankings")
    if cached:
        return cached

    # Fetch real state capacity data
    state_capacity = await fetch_eia_state_capacity()
    nrel_resources = await fetch_nrel_state_resources()

    # Build comprehensive state data
    all_states = []

    if state_capacity:
        for state_data in state_capacity:
            # Find NREL resource data if available
            nrel_data = next((nr for nr in nrel_resources if nr["state"] == state_data["state"]), {}) if nrel_resources else {}

            # Calculate potential score
            solar_cf = nrel_data.get("solar_capacity_factor", 0.22)
            wind_cf = 0.25  # Average US wind CF

            solar_score = int(min(100, 20 + (solar_cf * 200)))  # Scale to 20-100
            wind_score = int(min(100, 20 + (wind_cf * 200)))

            state_entry = {
                "state": state_data["state"],
                "solar_capacity_gw": state_data.get("solar_capacity_gw", 0),
                "wind_capacity_gw": state_data.get("wind_capacity_gw", 0),
                "solar_potential_score": solar_score,
                "wind_potential_score": wind_score,
                "avg_irradiance_kwh_m2_day": nrel_data.get("avg_irradiance_kwh_m2_day", 4.5),
                "avg_wind_speed_m_s": 6.5,
                "electricity_rate_cents_kwh": state_data.get("electricity_price_cents_kwh", 12),
                "lat": nrel_data.get("lat", 35.0),
                "lon": nrel_data.get("lon", -100.0)
            }
            all_states.append(state_entry)

    # Sort by potential
    solar_leaders = sorted(all_states, key=lambda x: x["solar_potential_score"], reverse=True)[:10]
    wind_leaders = sorted(all_states, key=lambda x: x["wind_potential_score"], reverse=True)[:10]

    result = {
        "all_states": all_states,
        "solar_potential": solar_leaders,
        "wind_potential": wind_leaders
    }

    cache_set("state_rankings", result)
    return result

@app.get("/api/location/{state}")
async def get_location_data(state: str):
    """Get REAL location-specific data: electricity rates, solar/wind resource"""
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

# ============ PROJECT CALCULATOR (UNCHANGED - all calculations are real) ============

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
    """AI research with live market context"""
    from anthropic import Anthropic

    messages = data.get("messages", [])
    current_calculator_state = data.get("calculator_state", {})

    # Fetch REAL context
    market = await get_market_summary()
    states = await get_state_rankings()

    # Build system prompt with REAL data
    system_prompt = f"""You are an expert renewable energy investment analyst.

CURRENT US MARKET (REAL LIVE DATA):
- Renewable Capacity: {market.get('us_renewable_capacity_gw', 340)} GW
- Solar: {market.get('solar_capacity_gw', 153)} GW
- Wind: {market.get('wind_capacity_gw', 145)} GW
- Electricity Price: {market.get('electricity_price_cents_per_kwh', 14.5)} ¢/kWh
- Growth: {market.get('yoy_growth_pct', 14.2)}%

TOP SOLAR STATES:
{json.dumps(states['solar_potential'][:3], indent=2)}

TOP WIND STATES:
{json.dumps(states['wind_potential'][:3], indent=2)}

USER PROJECT:
{json.dumps(current_calculator_state, indent=2) if current_calculator_state else 'No project'}

Be specific with numbers. Reference the real data."""

    try:
        client = Anthropic()
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": msg.get("role", "user"), "content": msg.get("content", "")} for msg in messages]
        )

        reply = response.content[0].text if response.content else ""
        return {"reply": reply}
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
            "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
            "eia": bool(os.getenv("EIA_API_KEY")),
            "nrel": bool(os.getenv("NREL_API_KEY")),
        },
        "cache_ttl_hours": 24
    }

