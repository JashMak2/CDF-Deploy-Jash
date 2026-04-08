import { useState, useEffect, useRef } from 'react'
import {
  getMarketSummary,
  getStateRankings,
  getLocationData,
  calculateProjectEconomics,
  sendChatMessage,
  healthCheck
} from './api/client'
import './App.css'

// ============ TAB 1: MARKET OVERVIEW ============
function MarketTab() {
  const [market, setMarket] = useState(null)
  const [states, setStates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadMarket() {
      try {
        const [m, s] = await Promise.all([
          getMarketSummary(),
          getStateRankings()
        ])
        setMarket(m)
        setStates(s)
        setError('')
      } catch (e) {
        setError('Failed to load market data. Make sure backend is running and API keys are set.')
      } finally {
        setLoading(false)
      }
    }
    loadMarket()
  }, [])

  if (error) return <div className="tab-content error"><p>{error}</p></div>

  return (
    <div className="tab-content">
      <h2>Market Overview</h2>

      {market ? (
        <div className="market-cards">
          <div className="card">
            <h3>Electricity Price</h3>
            <p className="big-number">{market.electricity_price_cents_per_kwh?.toFixed(1)}¢</p>
            <p className="label">per kWh (US average)</p>
          </div>
          <div className="card">
            <h3>Renewable Capacity</h3>
            <p className="big-number">{market.us_renewable_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">{market.renewables_pct_of_total?.toFixed(1)}% of total US</p>
          </div>
          <div className="card">
            <h3>Solar</h3>
            <p className="big-number">{market.solar_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">installed capacity</p>
          </div>
          <div className="card">
            <h3>Wind</h3>
            <p className="big-number">{market.wind_capacity_gw?.toFixed(0)} GW</p>
            <p className="label">installed capacity</p>
          </div>
        </div>
      ) : (
        <div className="market-cards">
          {[1,2,3,4].map(i => <div key={i} className="card skeleton"></div>)}
        </div>
      )}

      {states ? (
        <div className="market-section">
          <h3>Top States for Solar</h3>
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Capacity (GW)</th>
                <th>Score</th>
                <th>Irradiance (kWh/m²/day)</th>
              </tr>
            </thead>
            <tbody>
              {states.solar_potential?.slice(0, 5).map((s, i) => (
                <tr key={i}>
                  <td><strong>{s.state}</strong></td>
                  <td>{s.solar_capacity_gw}</td>
                  <td><span className="badge">{s.solar_potential_score}</span></td>
                  <td>{s.avg_irradiance_kwh_m2_day?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Top States for Wind</h3>
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Capacity (GW)</th>
                <th>Score</th>
                <th>Avg Wind Speed (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {states.wind_potential?.slice(0, 5).map((s, i) => (
                <tr key={i}>
                  <td><strong>{s.state}</strong></td>
                  <td>{s.wind_capacity_gw}</td>
                  <td><span className="badge">{s.wind_potential_score || s.solar_potential_score}</span></td>
                  <td>{s.avg_wind_speed_m_s?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ opacity: 0.5 }}>
          <p>Loading data...</p>
        </div>
      )}
    </div>
  )
}

// ============ TAB 2: PROJECT CALCULATOR ============
function CalculatorTab({ onUpdate }) {
  const [type, setType] = useState('solar')
  const [state, setState] = useState('AZ')
  const [sizeKw, setSizeKw] = useState(1000)
  const [capFactor, setCapFactor] = useState(0.22)
  const [costPerKw, setCostPerKw] = useState(2000)
  const [ppaRate, setPpaRate] = useState(12)
  const [debtPct, setDebtPct] = useState(0.6)
  const [interestRate, setInterestRate] = useState(5.5)
  const [termYears, setTermYears] = useState(20)
  const [itcPct, setItcPct] = useState(0.3)

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function recalculate() {
    setLoading(true)
    try {
      const res = await calculateProjectEconomics({
        type,
        system_size_kw: sizeKw,
        location_state: state,
        capacity_factor: capFactor,
        cost_per_kw: costPerKw,
        om_cost_per_kw_year: 15,
        ppa_rate_cents_kwh: ppaRate,
        debt_pct: debtPct,
        interest_rate_pct: interestRate,
        term_years: termYears,
        itc_pct: itcPct,
      })
      setResult(res)
      // Update parent with current state for AI context
      onUpdate({ type, state, system_size_kw: sizeKw, ppa_rate_cents_kwh: ppaRate, irr_pct: res.irr_pct })
      setError('')
    } catch (e) {
      setError('Calculation failed. Check backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    recalculate()
  }, [])

  const handleLocationClick = (newState) => {
    setState(newState)
  }

  return (
    <div className="tab-content">
      <h2>Project Economics Calculator</h2>
      <p className="subtitle-text">Model a solar or wind project and see the financial returns instantly</p>

      <div className="calc-layout">
        <div className="calc-inputs">
          <h3>📋 Project Setup</h3>

          <div className="input-section">
            <div className="input-group">
              <label>Technology Type</label>
              <p className="help-text">Choose between solar PV and wind turbines</p>
              <select value={type} onChange={(e) => { setType(e.target.value); setTimeout(recalculate, 100) }}>
                <option value="solar">☀️ Solar PV</option>
                <option value="wind">💨 Wind Turbine</option>
              </select>
            </div>

            <div className="input-group">
              <label>Project Location</label>
              <p className="help-text">State affects solar irradiance and wind speeds</p>
              <div className="state-selector">
                {['AZ', 'CA', 'TX', 'CO', 'NV'].map((s) => (
                  <button
                    key={s}
                    className={`state-btn ${state === s ? 'active' : ''}`}
                    onClick={() => { setState(s); setTimeout(recalculate, 100) }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h3>⚡ Physical Specs</h3>
          <div className="input-section">
            <div className="input-group">
              <label>System Size: <strong>{(sizeKw / 1000).toFixed(1)} MW</strong></label>
              <p className="help-text">Total generating capacity (0.5 - 100 MW)</p>
              <input
                type="range"
                min="500"
                max="100000"
                step="500"
                value={sizeKw}
                onChange={(e) => setSizeKw(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>

            <div className="input-group">
              <label>Capacity Factor: <strong>{(capFactor * 100).toFixed(1)}%</strong></label>
              <p className="help-text">% of time running at full capacity (affects annual output)</p>
              <input
                type="range"
                min="0.1"
                max="0.4"
                step="0.01"
                value={capFactor}
                onChange={(e) => setCapFactor(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>
          </div>

          <h3>💰 Financial Assumptions</h3>
          <div className="input-section">
            <div className="input-group">
              <label>Installation Cost: <strong>${costPerKw.toLocaleString()}/kW</strong></label>
              <p className="help-text">Total project cost per kilowatt</p>
              <input
                type="range"
                min="1000"
                max="5000"
                step="100"
                value={costPerKw}
                onChange={(e) => setCostPerKw(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>

            <div className="input-group">
              <label>PPA Rate: <strong>{ppaRate}¢/kWh</strong></label>
              <p className="help-text">Electricity sales price (power purchase agreement)</p>
              <input
                type="range"
                min="5"
                max="30"
                step="0.5"
                value={ppaRate}
                onChange={(e) => setPpaRate(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>
          </div>

          <h3>🏦 Financing</h3>
          <div className="input-section">
            <div className="input-group">
              <label>Debt Ratio: <strong>{(debtPct * 100).toFixed(0)}%</strong></label>
              <p className="help-text">Debt-to-total financing (30-80% typical)</p>
              <input
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                value={debtPct}
                onChange={(e) => setDebtPct(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>

            <div className="input-group">
              <label>Interest Rate: <strong>{interestRate.toFixed(2)}%</strong></label>
              <p className="help-text">Annual cost of debt financing</p>
              <input
                type="range"
                min="3"
                max="10"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                onMouseUp={recalculate}
                onTouchEnd={recalculate}
              />
            </div>
          </div>
        </div>

        {result && (
          <div className="calc-results">
            <h3>📊 Financial Results</h3>
            {error && <p className="error">{error}</p>}

            <div className="result-section">
              <h4 className="result-heading">🎯 Key Returns</h4>
              <div className="results-grid">
                <div className="result-box highlighted">
                  <p className="label">IRR</p>
                  <p className="big-number">{result.irr_pct?.toFixed(1)}%</p>
                  <p className="help-text">Annual return to equity holders</p>
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
          </div>
        )}
      </div>
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  async function sendMessage(text, topic = null) {
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
      const errorMsg = e.message || 'Connection error'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${errorMsg}. Ensure backend is running.`, timestamp: new Date() }])
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
        {/* ========== RESEARCH MODES ========== */}
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

        {/* ========== MAIN RESEARCH AREA ========== */}
        <div className="research-container">
          {/* Mode Header */}
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

          {/* Chat Area */}
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

            {/* Quick Prompts */}
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

            {/* Input Area */}
            <div className="research-input">
              <input
                type="text"
                placeholder={`Ask about ${researchTopics[activeSubTab].title}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading}
                className="send-btn"
              >
                {loading ? '⏳...' : '→'}
              </button>
            </div>
          </div>
        </div>

        {/* ========== RESEARCH SIDEBAR ========== */}
        <div className="research-sidebar">
          {/* Context */}
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

          {/* Saved Research */}
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

          {/* Tips */}
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
      <p className="subtitle-text">All 50 US states ranked by renewable energy investment potential</p>

      <div className="geo-mode-toggle">
        <button
          className={`mode-btn ${!compareMode ? 'active' : ''}`}
          onClick={() => setCompareMode(false)}
        >
          📍 Single State
        </button>
        <button
          className={`mode-btn ${compareMode ? 'active' : ''}`}
          onClick={() => setCompareMode(true)}
        >
          ⚖️ Compare States
        </button>
      </div>

      {!compareMode ? (
        // ========== SINGLE STATE VIEW ==========
        <div className="geo-layout">
          <div className="state-grid">
            {allStates.length > 0 ? (
              allStates.sort((a, b) => b.solar_potential_score - a.solar_potential_score).map((s, i) => (
                <button
                  key={i}
                  className={`state-card ${selectedState === s.state ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedState(s.state)
                    onSelectState(s.state)
                  }}
                >
                  <h4>{s.state}</h4>
                  <p className="score">Score: {s.solar_potential_score}</p>
                  <p className="capacity">{(s.solar_capacity_gw + s.wind_capacity_gw).toFixed(1)} GW</p>
                </button>
              ))
            ) : (
              <p style={{ opacity: 0.5, gridColumn: '1/-1' }}>Loading states...</p>
            )}
          </div>

          {selected && (
            <div className="state-details">
              <h3>{selected.state}</h3>
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
                {selected.avg_irradiance_kwh_m2_day && (
                  <div className="detail-box">
                    <p className="label">Solar Irradiance</p>
                    <p className="big-number">{selected.avg_irradiance_kwh_m2_day.toFixed(1)}</p>
                    <p className="label small">kWh/m²/day</p>
                  </div>
                )}
                {selected.avg_wind_speed_m_s && (
                  <div className="detail-box">
                    <p className="label">Avg Wind Speed</p>
                    <p className="big-number">{selected.avg_wind_speed_m_s?.toFixed(1)}</p>
                    <p className="label small">m/s</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // ========== COMPARISON VIEW ==========
        <div className="comparison-container">
          <div className="comparison-grid">
            {allStates.length > 0 ? (
              allStates.sort((a, b) => b.solar_potential_score - a.solar_potential_score).map((s, i) => (
                <button
                  key={i}
                  className={`state-card-select ${comparisonSelected.includes(s.state) ? 'selected' : ''}`}
                  onClick={() => toggleCompareSelection(s.state)}
                  title={comparisonSelected.includes(s.state) ? 'Remove from comparison' : 'Add to comparison'}
                >
                  <h4>{s.state}</h4>
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
              <h3>📊 Comparison: {comparisonStates.map(s => s.state).join(' vs ')}</h3>

              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {comparisonStates.map(s => (
                        <th key={s.state}>{s.state}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="metric-label">Investment Score</td>
                      {comparisonStates.map(s => (
                        <td key={s.state} className="metric-value">
                          <strong>{s.solar_potential_score}</strong>
                        </td>
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
                    {comparisonStates.some(s => s.avg_irradiance_kwh_m2_day) && (
                      <tr>
                        <td className="metric-label">Solar Irradiance (kWh/m²/day)</td>
                        {comparisonStates.map(s => (
                          <td key={s.state} className="metric-value">
                            {s.avg_irradiance_kwh_m2_day?.toFixed(1) || '—'}
                          </td>
                        ))}
                      </tr>
                    )}
                    {comparisonStates.some(s => s.avg_wind_speed_m_s) && (
                      <tr>
                        <td className="metric-label">Avg Wind Speed (m/s)</td>
                        {comparisonStates.map(s => (
                          <td key={s.state} className="metric-value">
                            {s.avg_wind_speed_m_s?.toFixed(1) || '—'}
                          </td>
                        ))}
                      </tr>
                    )}
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
          {/* Base */}
          <rect x="90" y="120" width="20" height="80" fill="rgba(99, 102, 241, 0.15)" />

          {/* Hub */}
          <circle cx="100" cy="120" r="12" fill="rgba(59, 130, 246, 0.2)" />

          {/* Blades */}
          <g className="blades">
            {/* Blade 1 */}
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.2)" />

            {/* Blade 2 */}
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.15)" transform="rotate(120 100 100)" />

            {/* Blade 3 */}
            <rect x="95" y="20" width="10" height="100" rx="5" fill="rgba(59, 130, 246, 0.1)" transform="rotate(240 100 100)" />
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
            onSelectState={(state) => setCalculatorState(prev => ({ ...prev, state }))}
          />
        </div>
      </div>

      <footer className="app-footer">
        <p>Renewable energy insights powered by EIA, NREL, Claude & live data | Built for impact</p>
      </footer>
    </div>
  )
}
