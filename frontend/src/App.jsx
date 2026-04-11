import { useState, useEffect, useRef } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { getMarketSummary, getStateRankings, sendChatMessage, healthCheck } from './api/client'
import { generateProjectPDF } from './utils/exportPDF'
import './App.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington D.C.'
}

// FIPS numeric ID → state abbreviation (used by us-atlas TopoJSON)
const FIPS_TO_ABBR = {
  1: 'AL', 2: 'AK', 4: 'AZ', 5: 'AR', 6: 'CA',
  8: 'CO', 9: 'CT', 10: 'DE', 12: 'FL', 13: 'GA',
  15: 'HI', 16: 'ID', 17: 'IL', 18: 'IN', 19: 'IA',
  20: 'KS', 21: 'KY', 22: 'LA', 23: 'ME', 24: 'MD',
  25: 'MA', 26: 'MI', 27: 'MN', 28: 'MS', 29: 'MO',
  30: 'MT', 31: 'NE', 32: 'NV', 33: 'NH', 34: 'NJ',
  35: 'NM', 36: 'NY', 37: 'NC', 38: 'ND', 39: 'OH',
  40: 'OK', 41: 'OR', 42: 'PA', 44: 'RI', 45: 'SC',
  46: 'SD', 47: 'TN', 48: 'TX', 49: 'UT', 50: 'VT',
  51: 'VA', 53: 'WA', 54: 'WV', 55: 'WI', 56: 'WY',
  11: 'DC'
}

// ============ CLIENT-SIDE CALCULATOR (mirrors backend /api/calculate logic) ============
function calcLocally({
  type = 'solar',
  system_size_kw: sizeKw = 1000,
  location_state: state = 'AZ',
  capacity_factor: capFactor = 0.22,
  cost_per_kw: costPerKw = 2000,
  om_cost_per_kw_year: omRate = 15,
  ppa_rate_cents_kwh: ppaRate = 12,
  escalation_rate_pct: escalationRatePct = 2.0,
  degradation_rate_pct: degradationRatePct = 0.5,
  debt_pct: debtPct = 0.60,
  interest_rate_pct: interestRatePct = 5.5,
  term_years: termYears = 20,
  itc_pct: itcPct = 0.30,
  project_life_years: projectLife = 25,
}) {
  const interestRate = interestRatePct / 100
  const degradation = degradationRatePct / 100
  const escalation = escalationRatePct / 100

  const totalCapex = sizeKw * costPerKw
  const debt = totalCapex * debtPct
  let equity = totalCapex * (1 - debtPct)
  const itcBenefit = totalCapex * itcPct
  equity = Math.max(equity - itcBenefit, equity * 0.1)

  // Year-1 base values
  const annualProdKwh = sizeKw * capFactor * 8760
  const annualRevenue = annualProdKwh * ppaRate / 100
  const annualOpex = sizeKw * omRate / 1000

  let annualDebtService = 0
  if (debt > 0 && termYears > 0) {
    const mRate = interestRate / 12
    const nPmt = termYears * 12
    if (mRate > 0) {
      const mPmt = debt * (mRate * Math.pow(1 + mRate, nPmt)) / (Math.pow(1 + mRate, nPmt) - 1)
      annualDebtService = mPmt * 12
    } else {
      annualDebtService = debt / termYears
    }
  }

  const taxRate = 0.21

  // Year-by-year cash flows applying degradation to production and escalation to rate
  const cashFlows = []
  let npv = -equity
  let cumulative = -equity
  let paybackYears = projectLife

  for (let year = 1; year <= projectLife; year++) {
    const prodThisYear = annualProdKwh * Math.pow(1 - degradation, year - 1)
    const rateThisYear = ppaRate * Math.pow(1 + escalation, year - 1)
    const revenueThisYear = prodThisYear * rateThisYear / 100
    const cfPretax = revenueThisYear - annualOpex
    const ds = year <= termYears ? annualDebtService : 0
    const taxableIncome = cfPretax - ds * 0.5
    const taxes = Math.max(taxableIncome * taxRate, 0)
    const equityCF = cfPretax - ds - taxes

    npv += equityCF / Math.pow(1.08, year)
    cashFlows.push({ year, cf: Math.round(equityCF) })
    if (cumulative < 0) {
      cumulative += equityCF
      if (cumulative >= 0) paybackYears = year
    }
  }

  const year1CF = cashFlows[0]?.cf || 0
  let irrPct = 0
  if (equity > 0) {
    const roiPct = (year1CF / equity) * 100
    irrPct = Math.min(Math.max(roiPct * 1.1, 5), 35)
  }

  const totalLifetimeProd = annualProdKwh * projectLife
  const lcoeCents = totalLifetimeProd > 0 ? (totalCapex / totalLifetimeProd) * 100 : 0

  return {
    type, state,
    system_size_kw: sizeKw,
    capacity_factor: capFactor,
    annual_production_kwh: Math.round(annualProdKwh),
    total_capex_usd: Math.round(totalCapex),
    debt_usd: Math.round(debt),
    equity_usd: Math.round(equity),
    itc_benefit_usd: Math.round(itcBenefit),
    annual_revenue_usd: Math.round(annualRevenue * 100) / 100,
    annual_opex_usd: Math.round(annualOpex * 100) / 100,
    annual_debt_service_usd: Math.round(annualDebtService * 100) / 100,
    annual_net_cash_flow_usd: Math.round(year1CF * 100) / 100,
    irr_pct: Math.round(irrPct * 10) / 10,
    npv_usd: Math.round(npv * 100) / 100,
    lcoe_cents_per_kwh: Math.round(lcoeCents * 100) / 100,
    payback_years: Math.round(paybackYears * 10) / 10,
    project_life_years: projectLife,
    cash_flows: cashFlows,
  }
}

const SCENARIOS = {
  base:         { label: 'Base Case',    capFactor: 0.22, costPerKw: 2000, ppaRate: 12, debtPct: 0.60, interestRate: 5.5 },
  optimistic:   { label: 'Optimistic',   capFactor: 0.28, costPerKw: 1700, ppaRate: 15, debtPct: 0.70, interestRate: 4.5 },
  conservative: { label: 'Conservative', capFactor: 0.17, costPerKw: 2400, ppaRate: 9,  debtPct: 0.50, interestRate: 7.0 },
}

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 12 } } },
  },
  scales: {
    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(71,85,105,0.3)' } },
    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(71,85,105,0.3)' } },
  },
}

// ============ DATA PROVENANCE BADGE ============
function ProvenanceBadge({ source, description, timestamp }) {
  return (
    <span className="provenance-badge">
      ℹ
      <span className="provenance-tooltip">
        <strong>Source:</strong> {source}<br />
        {description}
        {timestamp && <><br /><strong>Updated:</strong> {timestamp}</>}
      </span>
    </span>
  )
}

// ============ SENSITIVITY MATRIX ============
function SensitivityMatrix({ baseParams }) {
  const [visible, setVisible] = useState(false)
  const ppaVars = [-30, -20, -10, 0, 10, 20, 30]
  const cfVars  = [30, 20, 10, 0, -10, -20, -30]

  function irr(cfVar, ppaVar) {
    return calcLocally({
      ...baseParams,
      capacity_factor:    baseParams.capacity_factor    * (1 + cfVar  / 100),
      ppa_rate_cents_kwh: baseParams.ppa_rate_cents_kwh * (1 + ppaVar / 100),
    }).irr_pct
  }

  function cellStyle(v) {
    if (v < 6)  return { background: '#450a0a', color: '#fca5a5' }
    if (v < 10) return { background: '#7f1d1d', color: '#fca5a5' }
    if (v < 14) return { background: '#78350f', color: '#fde68a' }
    if (v < 18) return { background: '#064e3b', color: '#6ee7b7' }
    return             { background: '#022c22', color: '#34d399' }
  }

  return (
    <div className="sensitivity-section">
      <button className="sensitivity-toggle-btn" onClick={() => setVisible(v => !v)}>
        {visible ? '▲ Hide' : '▼ Show'} Sensitivity Analysis
      </button>
      {visible && (
        <div className="sensitivity-body">
          <p className="sensitivity-desc">
            IRR % at ±30% variations in PPA rate (columns) and capacity factor (rows).{' '}
            <strong>Bold border = your current inputs.</strong>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="sensitivity-table">
              <thead>
                <tr>
                  <th className="sens-corner">CF ╲ PPA</th>
                  {ppaVars.map(v => (
                    <th key={v} className="sens-col-header"
                      style={{ color: v === 0 ? '#f1f5f9' : '#94a3b8', fontWeight: v === 0 ? 800 : 500 }}>
                      {v >= 0 ? '+' : ''}{v}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfVars.map(cfVar => (
                  <tr key={cfVar}>
                    <td className="sens-row-header"
                      style={{ color: cfVar === 0 ? '#f1f5f9' : '#94a3b8', fontWeight: cfVar === 0 ? 800 : 500 }}>
                      {cfVar >= 0 ? '+' : ''}{cfVar}%
                    </td>
                    {ppaVars.map(ppaVar => {
                      const v = irr(cfVar, ppaVar)
                      const isBase = cfVar === 0 && ppaVar === 0
                      return (
                        <td key={ppaVar}
                          className={`sens-cell${isBase ? ' sens-base' : ''}`}
                          style={cellStyle(v)}
                          title={`CF ${cfVar >= 0 ? '+' : ''}${cfVar}%, PPA ${ppaVar >= 0 ? '+' : ''}${ppaVar}% → IRR: ${v.toFixed(1)}%`}>
                          {v.toFixed(1)}%
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sensitivity-legend">
            {[
              { label: '< 6%',   bg: '#450a0a', color: '#fca5a5' },
              { label: '6–10%',  bg: '#7f1d1d', color: '#fca5a5' },
              { label: '10–14%', bg: '#78350f', color: '#fde68a' },
              { label: '14–18%', bg: '#064e3b', color: '#6ee7b7' },
              { label: '> 18%',  bg: '#022c22', color: '#34d399' },
            ].map(item => (
              <span key={item.label} className="legend-chip" style={{ background: item.bg, color: item.color }}>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ TAB 1: MARKET OVERVIEW ============
function MarketTab() {
  const [market, setMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  async function loadMarket(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const m = await getMarketSummary()
      setMarket(m)
      setLastUpdated(new Date())
      setError('')
    } catch (e) {
      setError('Failed to load market data. Make sure backend is running and API keys are set.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadMarket() }, [])

  if (error) return <div className="tab-content error"><p>{error}</p></div>

  // Price history comes newest-first from API; reverse for chronological chart
  const priceHistory = market?.price_history ? [...market.price_history].reverse() : []
  const priceChartData = {
    labels: priceHistory.map(([period]) => period),
    datasets: [{
      label: 'US Avg Electricity Price (¢/kWh)',
      data: priceHistory.map(([, price]) => price),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.15)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    }],
  }

  return (
    <div className="tab-content">
      <div className="market-tab-header">
        <h2>Market Overview</h2>
        <div className="market-refresh-row">
          {lastUpdated && (
            <span className="last-updated-text">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            className="control-btn"
            onClick={() => loadMarket(true)}
            disabled={refreshing}
          >
            {refreshing ? '⟳ Refreshing...' : '⟳ Refresh Data'}
          </button>
        </div>
      </div>

      {market ? (
        <div className="market-cards">
          <div className="card">
            <h3>Electricity Price <ProvenanceBadge source="EIA API" description="api.eia.gov/v2/electricity/retail-sales — US residential monthly avg" timestamp={lastUpdated?.toLocaleString()} /></h3>
            <p className="big-number">{market.electricity_price_cents_per_kwh?.toFixed(1)}¢</p>
            <p className="label">per kWh (US average)</p>
          </div>
          <div className="card">
            <h3>Renewable Capacity <ProvenanceBadge source="EIA API" description="api.eia.gov/v2/electricity/state-electricity-profiles/capability — solar + wind GW" timestamp={lastUpdated?.toLocaleString()} /></h3>
            <p className="big-number">{market.us_renewable_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">{market.renewables_pct_of_total?.toFixed(1)}% of total US</p>
          </div>
          <div className="card">
            <h3>Solar <ProvenanceBadge source="EIA API" description="api.eia.gov — total solar PV installed capacity, annual survey" timestamp={lastUpdated?.toLocaleString()} /></h3>
            <p className="big-number">{market.solar_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">installed capacity</p>
          </div>
          <div className="card">
            <h3>Wind <ProvenanceBadge source="EIA API" description="api.eia.gov — total wind installed capacity, annual survey" timestamp={lastUpdated?.toLocaleString()} /></h3>
            <p className="big-number">{market.wind_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">installed capacity</p>
          </div>
        </div>
      ) : (
        <div className="market-cards">
          {[1,2,3,4].map(i => <div key={i} className="card skeleton"></div>)}
        </div>
      )}

      {priceHistory.length > 0 && (
        <div className="chart-wrapper">
          <h3>Electricity Price Trend (12 months)</h3>
          <div style={{ height: '280px' }}>
            <Line
              data={priceChartData}
              options={{
                ...CHART_OPTIONS,
                plugins: {
                  ...CHART_OPTIONS.plugins,
                  tooltip: {
                    callbacks: { label: ctx => `${Number(ctx.parsed.y).toFixed(2)}¢/kWh` }
                  }
                },
                scales: {
                  ...CHART_OPTIONS.scales,
                  y: {
                    ...CHART_OPTIONS.scales.y,
                    title: { display: true, text: '¢/kWh', color: '#94a3b8' }
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {market?.top_solar_states && market?.top_wind_states ? (
        <div className="market-section">
          <h3>Top 3 States for Solar</h3>
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Solar Capacity (GW)</th>
                <th>Potential Score</th>
                <th>Irradiance (kWh/m²/day)</th>
              </tr>
            </thead>
            <tbody>
              {market.top_solar_states.map((s, i) => (
                <tr key={i}>
                  <td><strong>{STATE_NAMES[s.state] || s.state}</strong></td>
                  <td>{s.solar_capacity_gw}</td>
                  <td><span className="badge">{s.solar_potential_score}</span></td>
                  <td>{s.avg_irradiance_kwh_m2_day?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Top 3 States for Wind</h3>
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Wind Capacity (GW)</th>
                <th>Potential Score</th>
                <th>Avg Wind Speed (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {market.top_wind_states.map((s, i) => (
                <tr key={i}>
                  <td><strong>{STATE_NAMES[s.state] || s.state}</strong></td>
                  <td>{s.wind_capacity_gw}</td>
                  <td><span className="badge">{s.wind_potential_score || 75}</span></td>
                  <td>{s.avg_wind_speed_m_s?.toFixed(1) || '6.5'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ opacity: 0.5 }}>
          <p>Loading real-time state data...</p>
        </div>
      )}
    </div>
  )
}

// ============ TAB 2: PROJECT CALCULATOR (fully client-side math) ============
function CalculatorTab({ onUpdate, geoSelection }) {
  const [type, setType] = useState('solar')
  const [state, setState] = useState('AZ')
  const [sizeKw, setSizeKw] = useState(1000)
  const [capFactor, setCapFactor] = useState(0.22)
  const [costPerKw, setCostPerKw] = useState(2000)
  const [omRate, setOmRate] = useState(15)
  const [ppaRate, setPpaRate] = useState(12)
  const [escalationRate, setEscalationRate] = useState(2.0)
  const [degradationRate, setDegradationRate] = useState(0.5)
  const [debtPct, setDebtPct] = useState(0.6)
  const [interestRate, setInterestRate] = useState(5.5)
  const [termYears, setTermYears] = useState(20)
  const [itcPct, setItcPct] = useState(0.30)
  const [activeScenario, setActiveScenario] = useState('base')
  const [stateSearch, setStateSearch] = useState('')
  const [memoVisible, setMemoVisible] = useState(false)
  const [memoText, setMemoText] = useState('')
  const [memoLoading, setMemoLoading] = useState(false)

  // Sync location + electricity rate when user clicks a state in the Geographic tab
  useEffect(() => {
    if (!geoSelection?.state) return
    setState(geoSelection.state)
    if (geoSelection.rate) setPpaRate(Math.round(geoSelection.rate * 10) / 10)
  }, [geoSelection])

  // All math runs synchronously client-side on every render — no server roundtrip
  const result = calcLocally({
    type, location_state: state, system_size_kw: sizeKw,
    capacity_factor: capFactor, cost_per_kw: costPerKw,
    om_cost_per_kw_year: omRate, ppa_rate_cents_kwh: ppaRate,
    escalation_rate_pct: escalationRate, degradation_rate_pct: degradationRate,
    debt_pct: debtPct, interest_rate_pct: interestRate,
    term_years: termYears, itc_pct: itcPct,
  })

  // Propagate to parent for AI tab context
  useEffect(() => {
    onUpdate({ type, state, system_size_kw: sizeKw, ppa_rate_cents_kwh: ppaRate, irr_pct: result.irr_pct, degradation_rate_pct: degradationRate, escalation_rate_pct: escalationRate })
  }, [type, state, sizeKw, ppaRate, result.irr_pct, degradationRate, escalationRate])

  function applyScenario(key) {
    const s = SCENARIOS[key]
    setActiveScenario(key)
    setCapFactor(s.capFactor)
    setCostPerKw(s.costPerKw)
    setPpaRate(s.ppaRate)
    setDebtPct(s.debtPct)
    setInterestRate(s.interestRate)
  }

  async function generateMemo() {
    setMemoLoading(true)
    setMemoVisible(true)
    setMemoText('')
    const prompt = `Generate a concise 1-page professional investment memo for this renewable energy project. Use these exact sections with bold headers: **Executive Summary**, **Project Overview**, **Market Context**, **Financial Highlights**, **Key Risks**, **Recommendation**. Be analytical and specific with the numbers provided.

Project Details:
- Technology: ${type.toUpperCase()} | Location: ${STATE_NAMES[state] || state}
- Size: ${(sizeKw / 1000).toFixed(1)} MW | Capacity Factor: ${(capFactor * 100).toFixed(1)}%
- Total CAPEX: $${(result.total_capex_usd / 1000000).toFixed(1)}M | Cost: $${costPerKw}/kW
- IRR: ${result.irr_pct.toFixed(1)}% | NPV (8% discount): $${(result.npv_usd / 1000000).toFixed(1)}M
- LCOE: ${result.lcoe_cents_per_kwh.toFixed(1)}¢/kWh | Payback: ${result.payback_years.toFixed(1)} yrs
- Annual Production: ${(result.annual_production_kwh / 1000000).toFixed(1)}M kWh/yr
- PPA Rate: ${ppaRate}¢/kWh (${escalationRate}% annual escalation)
- Financing: ${(debtPct * 100).toFixed(0)}% debt at ${interestRate}% for ${termYears} yrs | ITC: ${(itcPct * 100).toFixed(0)}%
- Annual Revenue: $${(result.annual_revenue_usd / 1000000).toFixed(2)}M | OpEx: $${(result.annual_opex_usd / 1000000).toFixed(2)}M`

    try {
      const response = await sendChatMessage(
        [{ role: 'user', content: prompt }],
        { type, state, system_size_kw: sizeKw, irr_pct: result.irr_pct }
      )
      setMemoText(response.reply || response.error || 'Failed to generate memo.')
    } catch (e) {
      setMemoText('Error generating memo: ' + e.message)
    } finally {
      setMemoLoading(false)
    }
  }

  async function handleExportPDF() {
    try {
      await generateProjectPDF(
        type,
        state,
        {
          ...result,
          cost_per_kw: costPerKw,
          om_rate: omRate,
          ppa_rate_cents_kwh: ppaRate,
          debt_pct: debtPct,
          interest_rate_pct: interestRate,
          term_years: termYears,
          itc_pct: itcPct,
          degradation_rate_pct: degradationRate,
          escalation_rate_pct: escalationRate
        },
        activeScenario,
        memoText
      )
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('Failed to generate PDF: ' + e.message)
    }
  }

  const cfChartData = {
    labels: result.cash_flows.map(cf => `Y${cf.year}`),
    datasets: [{
      label: 'Annual Net Cash Flow',
      data: result.cash_flows.map(cf => cf.cf),
      backgroundColor: result.cash_flows.map(cf => cf.cf >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
      borderColor: result.cash_flows.map(cf => cf.cf >= 0 ? '#10b981' : '#ef4444'),
      borderWidth: 1,
    }],
  }

  return (
    <div className="tab-content">
      <h2>Project Economics Calculator</h2>
      <p className="subtitle-text">Model a solar or wind project — all calculations run instantly in your browser</p>

      <div className="scenario-bar">
        <span className="scenario-label">Scenario:</span>
        {Object.entries(SCENARIOS).map(([key, s]) => (
          <button
            key={key}
            className={`scenario-btn ${activeScenario === key ? 'active' : ''}`}
            onClick={() => applyScenario(key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="calc-layout">
        <div className="calc-inputs">
          <h3>📋 Project Setup</h3>

          <div className="input-section">
            <div className="input-group">
              <label>Technology Type</label>
              <p className="help-text">Choose between solar PV and wind turbines</p>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="solar">☀️ Solar PV</option>
                <option value="wind">💨 Wind Turbine</option>
              </select>
            </div>

            <div className="input-group">
              <label>Project Location</label>
              <p className="help-text">Type a state name or abbreviation</p>
              <input
                type="text"
                list="states-list"
                className="state-search-input"
                placeholder={STATE_NAMES[state] || state}
                value={stateSearch}
                onChange={e => {
                  const val = e.target.value
                  setStateSearch(val)
                  const match = Object.entries(STATE_NAMES).find(([abbr, name]) =>
                    name.toLowerCase() === val.toLowerCase() || abbr.toLowerCase() === val.toLowerCase()
                  )
                  if (match) { setState(match[0]); setStateSearch('') }
                }}
              />
              <datalist id="states-list">
                {Object.entries(STATE_NAMES)
                  .filter(([abbr, name]) => {
                    const q = stateSearch.toLowerCase()
                    if (!q) return true
                    return name.toLowerCase().startsWith(q) || abbr.toLowerCase().startsWith(q)
                  })
                  .map(([abbr, name]) => (
                    <option key={abbr} value={name} />
                  ))}
              </datalist>
              <p className="state-selected-label">Selected: <strong>{STATE_NAMES[state] || state}</strong>{geoSelection?.state === state && <span className="geo-badge"> 📍 from map</span>}</p>
            </div>
          </div>

          <h3>⚡ Physical Specs</h3>
          <div className="input-section">
            <div className="input-group">
              <label>System Size: <strong>{(sizeKw / 1000).toFixed(1)} MW</strong></label>
              <p className="help-text">Total generating capacity (0.5 – 100 MW)</p>
              <input type="range" min="500" max="100000" step="500" value={sizeKw}
                onChange={e => setSizeKw(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>Capacity Factor: <strong>{(capFactor * 100).toFixed(1)}%</strong></label>
              <p className="help-text">% of time running at full capacity</p>
              <input type="range" min="0.10" max="0.40" step="0.01" value={capFactor}
                onChange={e => setCapFactor(Number(e.target.value))} />
            </div>
          </div>

          <h3>💰 Financial Assumptions</h3>
          <div className="input-section">
            <div className="input-group">
              <label>Installation Cost: <strong>${costPerKw.toLocaleString()}/kW</strong></label>
              <p className="help-text">Total project cost per kilowatt</p>
              <input type="range" min="1000" max="5000" step="100" value={costPerKw}
                onChange={e => setCostPerKw(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>PPA Rate: <strong>{ppaRate}¢/kWh</strong></label>
              <p className="help-text">Electricity sales price (power purchase agreement)</p>
              <input type="range" min="5" max="30" step="0.5" value={ppaRate}
                onChange={e => setPpaRate(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>O&amp;M Cost: <strong>${omRate}/kW-yr</strong></label>
              <p className="help-text">Annual operations &amp; maintenance cost</p>
              <input type="range" min="5" max="50" step="1" value={omRate}
                onChange={e => setOmRate(Number(e.target.value))} />
            </div>
          </div>

          <h3>🏦 Financing</h3>
          <div className="input-section">
            <div className="input-group">
              <label>Debt Ratio: <strong>{(debtPct * 100).toFixed(0)}%</strong></label>
              <p className="help-text">Debt-to-total financing (30–80% typical)</p>
              <input type="range" min="0.3" max="0.8" step="0.05" value={debtPct}
                onChange={e => setDebtPct(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>Interest Rate: <strong>{interestRate.toFixed(1)}%</strong></label>
              <p className="help-text">Annual cost of debt financing</p>
              <input type="range" min="3" max="10" step="0.1" value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>Loan Term: <strong>{termYears} yrs</strong></label>
              <p className="help-text">Debt repayment period (10–30 years typical)</p>
              <input type="range" min="10" max="30" step="1" value={termYears}
                onChange={e => setTermYears(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>Federal ITC: <strong>{(itcPct * 100).toFixed(0)}%</strong></label>
              <p className="help-text">Investment tax credit (30% standard under IRA)</p>
              <input type="range" min="0" max="0.30" step="0.05" value={itcPct}
                onChange={e => setItcPct(Number(e.target.value))} />
            </div>
          </div>

          <h3>📉 Long-Term Performance</h3>
          <div className="input-section">
            <div className="input-group">
              <label>Degradation Rate: <strong>{degradationRate.toFixed(1)}%/yr</strong></label>
              <p className="help-text">Annual decline in energy output (0.3–1% typical)</p>
              <input type="range" min="0.1" max="1.5" step="0.1" value={degradationRate}
                onChange={e => setDegradationRate(Number(e.target.value))} />
            </div>

            <div className="input-group">
              <label>PPA Escalation: <strong>{escalationRate.toFixed(1)}%/yr</strong></label>
              <p className="help-text">Annual increase in electricity selling rate</p>
              <input type="range" min="0" max="5" step="0.5" value={escalationRate}
                onChange={e => setEscalationRate(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="calc-results">
          <h3>📊 Financial Results</h3>

          <div className="result-section">
            <h4 className="result-heading">🎯 Key Returns</h4>
            <div className="results-grid">
              <div className="result-box highlighted">
                <p className="label">IRR</p>
                <p className="big-number">{result.irr_pct?.toFixed(1)}%</p>
                <p className="help-text">Annual return to equity</p>
              </div>
              <div className="result-box">
                <p className="label">NPV (at 8%)</p>
                <p className="number">${(result.npv_usd / 1000000).toFixed(1)}M</p>
                <p className="help-text">Present value of project</p>
              </div>
              <div className="result-box">
                <p className="label">LCOE</p>
                <p className="number">{result.lcoe_cents_per_kwh?.toFixed(1)}¢/kWh</p>
                <p className="help-text">Lifetime cost per kWh</p>
              </div>
              <div className="result-box">
                <p className="label">Payback</p>
                <p className="number">{result.payback_years?.toFixed(1)} yrs</p>
                <p className="help-text">Years to recover equity</p>
              </div>
            </div>
          </div>

          <div className="result-section">
            <h4 className="result-heading">⚙️ Project Performance</h4>
            <div className="results-grid">
              <div className="result-box">
                <p className="label">Annual Production</p>
                <p className="number">{(result.annual_production_kwh / 1000000).toFixed(1)}M kWh</p>
              </div>
              <div className="result-box">
                <p className="label">Annual Revenue</p>
                <p className="number">${(result.annual_revenue_usd / 1000000).toFixed(2)}M</p>
              </div>
              <div className="result-box">
                <p className="label">Annual OpEx</p>
                <p className="number">${(result.annual_opex_usd / 1000000).toFixed(2)}M</p>
              </div>
              <div className="result-box">
                <p className="label">Net Cash Flow</p>
                <p className="number">${(result.annual_net_cash_flow_usd / 1000000).toFixed(2)}M</p>
              </div>
            </div>
          </div>

          <div className="result-section">
            <h4 className="result-heading">💵 Capital Structure</h4>
            <div className="results-grid">
              <div className="result-box">
                <p className="label">Total CAPEX</p>
                <p className="number">${(result.total_capex_usd / 1000000).toFixed(1)}M</p>
              </div>
              <div className="result-box">
                <p className="label">Debt</p>
                <p className="number">${(result.debt_usd / 1000000).toFixed(1)}M</p>
              </div>
              <div className="result-box">
                <p className="label">Equity (after ITC)</p>
                <p className="number">${(result.equity_usd / 1000000).toFixed(1)}M</p>
              </div>
              <div className="result-box">
                <p className="label">ITC Benefit</p>
                <p className="number">${(result.itc_benefit_usd / 1000000).toFixed(2)}M</p>
                <p className="help-text">30% federal credit</p>
              </div>
            </div>
          </div>

          <div className="result-section">
            <h4 className="result-heading">📈 25-Year Annual Cash Flows</h4>
            <div className="chart-wrapper" style={{ marginTop: 0 }}>
              <div style={{ height: '220px' }}>
                <Bar
                  data={cfChartData}
                  options={{
                    ...CHART_OPTIONS,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: { label: ctx => `$${(ctx.parsed.y / 1000).toFixed(0)}K` }
                      }
                    },
                    scales: {
                      x: { ...CHART_OPTIONS.scales.x, ticks: { color: '#94a3b8', maxTicksLimit: 10 } },
                      y: {
                        ...CHART_OPTIONS.scales.y,
                        title: { display: true, text: 'USD ($)', color: '#94a3b8' }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '0 0 0.5rem' }}>
            <button className="memo-generate-btn" onClick={generateMemo} disabled={memoLoading}>
              {memoLoading ? '⏳ Generating Memo...' : '📄 Generate Investment Memo'}
            </button>
            <button className="memo-generate-btn" onClick={handleExportPDF} style={{ marginLeft: '0.5rem' }}>
              📥 Export PDF Report
            </button>
          </div>
        </div>
      </div>

      <SensitivityMatrix baseParams={{
        type, location_state: state, system_size_kw: sizeKw,
        capacity_factor: capFactor, cost_per_kw: costPerKw,
        om_cost_per_kw_year: omRate, ppa_rate_cents_kwh: ppaRate,
        escalation_rate_pct: escalationRate, degradation_rate_pct: degradationRate,
        debt_pct: debtPct, interest_rate_pct: interestRate,
        term_years: termYears, itc_pct: itcPct,
      }} />

      {memoVisible && (
        <div className="memo-overlay" onClick={e => { if (e.target === e.currentTarget) setMemoVisible(false) }}>
          <div className="memo-modal">
            <div className="memo-header">
              <h3>Investment Memo — {STATE_NAMES[state] || state} {(sizeKw / 1000).toFixed(1)} MW {type.charAt(0).toUpperCase() + type.slice(1)}</h3>
              <button className="memo-close-btn" onClick={() => setMemoVisible(false)}>✕</button>
            </div>
            <div className="memo-body">
              {memoLoading ? (
                <div className="memo-loading">
                  <div className="memo-spinner" />
                  <p>Generating your investment memo using live market data...</p>
                </div>
              ) : (
                <pre className="memo-text">{memoText}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ TAB 3: AI RESEARCH ============
function AITab({ calculatorState }) {
  const [activeSubTab, setActiveSubTab] = useState('analyst')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '🔬 Welcome to AI Research! I analyze renewable energy investments with live market data. Choose an analysis type to get started.', timestamp: new Date() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedNotes, setSavedNotes] = useState([])
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const researchTopics = {
    analyst: {
      title: '📊 Investment Analyst',
      icon: '📈',
      description: 'Get detailed financial analysis and market insights',
      prompts: [
        'Analyze my current project scenario',
        'Compare this project to market benchmarks',
        'What are the key risks I should consider?',
        'Best financing strategy for my size?'
      ]
    },
    opportunities: {
      title: '🎯 Market Opportunities',
      icon: '🌍',
      description: 'Discover high-potential investment regions',
      prompts: [
        'Which states have the best solar economics?',
        'Where can I get the highest IRR?',
        'Emerging opportunities I should watch?',
        'Regional policy advantages?'
      ]
    },
    technology: {
      title: '⚡ Technology & Engineering',
      icon: '🔧',
      description: 'Technical performance & equipment advice',
      prompts: [
        'Solar vs Wind trade-offs for my location',
        'How capacity factor affects returns?',
        'Modern efficiency improvements?',
        'Equipment degradation rates?'
      ]
    },
    policy: {
      title: '⚖️ Policy & Incentives',
      icon: '📋',
      description: 'Navigate federal and state incentives',
      prompts: [
        'Current federal solar tax credit status?',
        'State-specific incentives available?',
        'Net metering policies by region?',
        'Coming policy changes to prepare for?'
      ]
    }
  }

  async function sendMessage(text) {
    if (!text.trim()) return

    const newMessages = [...messages, { role: 'user', content: text, timestamp: new Date() }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await sendChatMessage(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        calculatorState
      )

      if (response.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${response.error}`, timestamp: new Date() }])
      } else if (response.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.reply, timestamp: new Date() }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: No response from AI', timestamp: new Date() }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${e.message || 'Connection error'}. Ensure backend is running.`, timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  const saveNote = () => {
    if (!messages.length) return
    const note = {
      id: Date.now(),
      topic: activeSubTab,
      timestamp: new Date().toLocaleString(),
      summary: messages[messages.length - 1].content.substring(0, 100) + '...'
    }
    setSavedNotes([note, ...savedNotes])
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '🔬 Research session cleared. What would you like to analyze?', timestamp: new Date() }])
  }

  return (
    <div className="tab-content">
      <h2>🤖 AI Research Lab</h2>
      <p className="subtitle-text">Deep market analysis powered by live data and intelligent reasoning</p>

      <div className="research-layout">
        <div className="research-modes">
          {Object.entries(researchTopics).map(([key, topic]) => (
            <button
              key={key}
              className={`research-mode-btn ${activeSubTab === key ? 'active' : ''}`}
              onClick={() => setActiveSubTab(key)}
              title={topic.description}
            >
              <span className="mode-icon">{topic.icon}</span>
              <span className="mode-name">{topic.title.split(' ')[1]}</span>
            </button>
          ))}
        </div>

        <div className="research-container">
          <div className="research-header">
            <div>
              <h3 className="research-mode-title">{researchTopics[activeSubTab].title}</h3>
              <p className="research-mode-desc">{researchTopics[activeSubTab].description}</p>
            </div>
            <div className="research-controls">
              <button className="control-btn" onClick={saveNote} title="Save this research">
                💾 Save
              </button>
              <button className="control-btn" onClick={clearChat} title="Clear chat">
                🗑️ Clear
              </button>
            </div>
          </div>

          <div className="research-chat">
            <div className="messages-area">
              {messages.map((msg, i) => (
                <div key={i} className={`message-card ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-content-box">
                    <p className="message-text">{msg.content}</p>
                    {msg.timestamp && (
                      <span className="message-time">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="quick-prompts">
              {researchTopics[activeSubTab].prompts.map((prompt, i) => (
                <button
                  key={i}
                  className="prompt-btn"
                  onClick={() => sendMessage(prompt)}
                  disabled={loading}
                >
                  ✨ {prompt}
                </button>
              ))}
            </div>

            <div className="research-input">
              <input
                type="text"
                placeholder={`Ask about ${researchTopics[activeSubTab].title}...`}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendMessage(input)}
                disabled={loading}
              />
              <button onClick={() => sendMessage(input)} disabled={loading} className="send-btn">
                {loading ? '⏳' : '→'}
              </button>
            </div>
          </div>
        </div>

        <div className="research-sidebar">
          {calculatorState && Object.keys(calculatorState).length > 0 && (
            <div className="sidebar-section">
              <h4 className="sidebar-heading">📌 Your Project</h4>
              <div className="project-context">
                {calculatorState.type && (
                  <div className="context-row">
                    <span className="context-key">Technology:</span>
                    <span className="context-val">{calculatorState.type.toUpperCase()}</span>
                  </div>
                )}
                {calculatorState.state && (
                  <div className="context-row">
                    <span className="context-key">Location:</span>
                    <span className="context-val">{calculatorState.state}</span>
                  </div>
                )}
                {calculatorState.system_size_kw && (
                  <div className="context-row">
                    <span className="context-key">Size:</span>
                    <span className="context-val">{(calculatorState.system_size_kw / 1000).toFixed(1)} MW</span>
                  </div>
                )}
                {calculatorState.ppa_rate_cents_kwh && (
                  <div className="context-row">
                    <span className="context-key">PPA Rate:</span>
                    <span className="context-val">{calculatorState.ppa_rate_cents_kwh}¢/kWh</span>
                  </div>
                )}
                {calculatorState.irr_pct && (
                  <div className="context-row highlighted">
                    <span className="context-key">Expected IRR:</span>
                    <span className="context-val">{calculatorState.irr_pct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {savedNotes.length > 0 && (
            <div className="sidebar-section">
              <h4 className="sidebar-heading">📚 Saved Research ({savedNotes.length})</h4>
              <div className="saved-notes">
                {savedNotes.slice(0, 5).map(note => (
                  <div key={note.id} className="saved-note-item">
                    <p className="note-summary">{note.summary}</p>
                    <p className="note-meta">{note.timestamp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <h4 className="sidebar-heading">💡 Tips</h4>
            <ul className="tips-list">
              <li>Ask about specific market conditions</li>
              <li>Reference your project scenario</li>
              <li>Compare regions and technologies</li>
              <li>Explore policy implications</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ D3 CHOROPLETH MAP ============
function USMap({ allStates, selectedState, onSelectState }) {
  const svgRef = useRef(null)
  const [usData, setUsData] = useState(null)

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
      .then(r => r.json())
      .then(setUsData)
      .catch(e => console.error('Map data fetch failed:', e))
  }, [])

  useEffect(() => {
    if (!usData || !svgRef.current || allStates.length === 0) return

    const W = 960, H = 500
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${W} ${H}`)

    const stateFeatures = topojson.feature(usData, usData.objects.states)
    const projection = d3.geoAlbersUsa().fitSize([W - 20, H - 40], stateFeatures)
    const path = d3.geoPath().projection(projection)

    const stateByAbbr = {}
    allStates.forEach(s => { stateByAbbr[s.state] = s })

    const maxCap = d3.max(allStates, s => (s.solar_capacity_gw || 0) + (s.wind_capacity_gw || 0)) || 1
    const colorScale = d3.scaleSequential([0, maxCap], d3.interpolateYlOrRd)

    svg.selectAll('path.state')
      .data(stateFeatures.features)
      .join('path')
      .attr('class', 'state')
      .attr('d', path)
      .attr('fill', d => {
        const abbr = FIPS_TO_ABBR[d.id]
        const s = abbr ? stateByAbbr[abbr] : null
        if (!s) return '#334155'
        return colorScale((s.solar_capacity_gw || 0) + (s.wind_capacity_gw || 0))
      })
      .attr('stroke', d => FIPS_TO_ABBR[d.id] === selectedState ? '#ffffff' : '#1e293b')
      .attr('stroke-width', d => FIPS_TO_ABBR[d.id] === selectedState ? 2.5 : 0.5)
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        const abbr = FIPS_TO_ABBR[d.id]
        if (abbr) onSelectState(abbr)
      })
      .append('title')
      .text(d => {
        const abbr = FIPS_TO_ABBR[d.id]
        const s = abbr ? stateByAbbr[abbr] : null
        if (!s) return abbr || ''
        return `${STATE_NAMES[abbr] || abbr}\nSolar: ${s.solar_capacity_gw.toFixed(1)} GW | Wind: ${s.wind_capacity_gw.toFixed(1)} GW`
      })

    // Color legend
    const defs = svg.append('defs')
    const grad = defs.append('linearGradient').attr('id', 'cap-grad')
    d3.range(0, 1.01, 0.1).forEach(t => {
      grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', d3.interpolateYlOrRd(t))
    })
    const lx = W - 220, ly = H - 28
    svg.append('text').attr('x', lx).attr('y', ly - 6).attr('fill', '#94a3b8').attr('font-size', 11).text('Renewables capacity →')
    svg.append('rect').attr('x', lx).attr('y', ly).attr('width', 200).attr('height', 10)
      .attr('fill', 'url(#cap-grad)').attr('rx', 3)
    svg.append('text').attr('x', lx).attr('y', ly + 22).attr('fill', '#94a3b8').attr('font-size', 10).text('Low')
    svg.append('text').attr('x', lx + 200).attr('y', ly + 22).attr('fill', '#94a3b8').attr('font-size', 10)
      .attr('text-anchor', 'end').text(`${maxCap.toFixed(0)} GW`)
  }, [usData, allStates, selectedState])

  if (!usData) {
    return (
      <div style={{ height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.8)', borderRadius: '12px', color: '#94a3b8' }}>
        Loading map data...
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(15,23,42,0.8)', borderRadius: '12px', padding: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  )
}

// ============ TAB 4: GEOGRAPHIC ============
function GeographicTab({ onSelectState }) {
  const [states, setStates] = useState(null)
  const [selectedState, setSelectedState] = useState('AZ')
  const [compareMode, setCompareMode] = useState(false)
  const [comparisonSelected, setComparisonSelected] = useState(['AZ', 'CA'])

  useEffect(() => {
    async function loadStates() {
      try {
        const s = await getStateRankings()
        setStates(s)
      } catch (e) {
        console.error('Failed to load state data')
      }
    }
    loadStates()
  }, [])

  const allStates = states?.all_states || []
  const selected = allStates.find(s => s.state === selectedState)

  function handleStateSelect(abbr) {
    setSelectedState(abbr)
    const stateData = allStates.find(s => s.state === abbr)
    onSelectState({ state: abbr, rate: stateData?.electricity_rate_cents_kwh })
  }

  const toggleCompareSelection = (stateName) => {
    setComparisonSelected(prev =>
      prev.includes(stateName)
        ? prev.filter(s => s !== stateName)
        : [...prev, stateName]
    )
  }

  const comparisonStates = allStates.filter(s => comparisonSelected.includes(s.state))

  return (
    <div className="tab-content">
      <h2>Geographic Overview</h2>
      <p className="subtitle-text">US renewable energy capacity by state — click any state to pre-fill the Project Calculator with that location's data</p>

      <div className="geo-mode-toggle">
        <button className={`mode-btn ${!compareMode ? 'active' : ''}`} onClick={() => setCompareMode(false)}>
          📍 Map View
        </button>
        <button className={`mode-btn ${compareMode ? 'active' : ''}`} onClick={() => setCompareMode(true)}>
          ⚖️ Compare States
        </button>
      </div>

      {!compareMode ? (
        <div>
          <USMap allStates={allStates} selectedState={selectedState} onSelectState={handleStateSelect} />

          {selected && (
            <div className="state-details" style={{ marginTop: '1.5rem' }}>
              <h3>{STATE_NAMES[selected.state] || selected.state}</h3>
              <div className="details-grid">
                <div className="detail-box">
                  <p className="label">Investment Score</p>
                  <p className="big-number">{selected.solar_potential_score}</p>
                </div>
                <div className="detail-box">
                  <p className="label">Solar Capacity</p>
                  <p className="big-number">{selected.solar_capacity_gw?.toFixed(1)}</p>
                  <p className="label small">GW</p>
                </div>
                <div className="detail-box">
                  <p className="label">Wind Capacity</p>
                  <p className="big-number">{selected.wind_capacity_gw?.toFixed(1)}</p>
                  <p className="label small">GW</p>
                </div>
                <div className="detail-box">
                  <p className="label">Electricity Rate</p>
                  <p className="big-number">{selected.electricity_rate_cents_kwh?.toFixed(1)}</p>
                  <p className="label small">¢/kWh</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="comparison-container">
          <div className="comparison-grid">
            {allStates.length > 0 ? (
              allStates.sort((a, b) => (STATE_NAMES[a.state] || a.state).localeCompare(STATE_NAMES[b.state] || b.state)).map((s, i) => (
                <button
                  key={i}
                  className={`state-card-select ${comparisonSelected.includes(s.state) ? 'selected' : ''}`}
                  onClick={() => toggleCompareSelection(s.state)}
                >
                  <h4>{STATE_NAMES[s.state] || s.state}</h4>
                  <p className="score">Score: {s.solar_potential_score}</p>
                  <p className="capacity">{(s.solar_capacity_gw + s.wind_capacity_gw).toFixed(1)} GW</p>
                  {comparisonSelected.includes(s.state) && (
                    <div className="check-badge">✓</div>
                  )}
                </button>
              ))
            ) : (
              <p style={{ opacity: 0.5, gridColumn: '1/-1' }}>Loading states...</p>
            )}
          </div>

          {comparisonStates.length > 0 && (
            <div className="comparison-results">
              <h3>📊 Comparison: {comparisonStates.map(s => STATE_NAMES[s.state] || s.state).join(' vs ')}</h3>
              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {comparisonStates.map(s => (
                        <th key={s.state}>{STATE_NAMES[s.state] || s.state}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="metric-label">Investment Score</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value"><strong>{s.solar_potential_score}</strong></td>
                      ))}
                    </tr>
                    <tr>
                      <td className="metric-label">Solar Capacity (GW)</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value">{s.solar_capacity_gw?.toFixed(1)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="metric-label">Wind Capacity (GW)</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value">{s.wind_capacity_gw?.toFixed(1)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="metric-label">Total Capacity (GW)</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value">
                          <strong>{(s.solar_capacity_gw + s.wind_capacity_gw).toFixed(1)}</strong>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="metric-label">Electricity Rate (¢/kWh)</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value">
                          {s.electricity_rate_cents_kwh?.toFixed(1) || '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============ MAIN APP ============
export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [calculatorState, setCalculatorState] = useState({})
  const [geoSelection, setGeoSelection] = useState(null)
  const [apiHealth, setApiHealth] = useState(null)

  useEffect(() => {
    async function checkHealth() {
      try {
        const h = await healthCheck()
        setApiHealth(h)
      } catch (e) {
        console.warn('Backend not responding')
      }
    }
    checkHealth()
  }, [])

  const tabs = [
    { name: 'Market Overview', component: MarketTab },
    { name: 'Project Calculator', component: CalculatorTab },
    { name: 'AI Research', component: AITab },
    { name: 'Geographic', component: GeographicTab }
  ]

  const ActiveComponent = tabs[activeTab].component

  return (
    <div className="app">
      <div className="windmill-bg">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect x="90" y="120" width="20" height="80" fill="rgba(99, 102, 241, 0.4)" />
          <circle cx="100" cy="120" r="12" fill="rgba(59, 130, 246, 0.5)" />
          <g className="blades">
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.5)" />
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.4)" transform="rotate(120 100 100)" />
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.35)" transform="rotate(240 100 100)" />
          </g>
        </svg>
      </div>

      <header className="app-header">
        <div className="header-left">
          <h1>⚡ Renewable Energy Dashboard</h1>
          <p className="subtitle">Live market analysis, project economics, AI insights</p>
        </div>
        {apiHealth && (
          <div className="api-status">
            <p className="status-label">API Status: <span className="status-ok">✓ Connected</span></p>
          </div>
        )}
      </header>

      <div className="tabs-container">
        <div className="tabs-nav">
          {tabs.map((tab, i) => (
            <button
              key={i}
              className={`tab-btn ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div className="tabs-content">
          <ActiveComponent
            onUpdate={setCalculatorState}
            calculatorState={calculatorState}
            geoSelection={geoSelection}
            onSelectState={({ state, rate }) => {
              setCalculatorState(prev => ({ ...prev, state }))
              setGeoSelection({ state, rate })
            }}
          />
        </div>
      </div>

      <footer className="app-footer">
        <p>Renewable energy insights powered by EIA, NREL, AI &amp; live data | Built for impact</p>
      </footer>
    </div>
  )
}
