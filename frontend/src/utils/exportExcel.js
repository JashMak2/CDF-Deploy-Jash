import * as XLSX from 'xlsx'

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

export function generateProjectExcel(type, state, result, params) {
  const wb = XLSX.utils.book_new()

  // ---- Sheet 1: Inputs & Results (formula-driven) ----
  const ws1 = XLSX.utils.aoa_to_sheet([])

  // Title
  XLSX.utils.sheet_add_aoa(ws1, [
    [`RENEWABLE ENERGY PROJECT ANALYSIS — ${type.toUpperCase()}`],
    [`${STATE_NAMES[state] || state} · ${(params.sizeKw / 1000).toFixed(1)} MW · Generated: ${new Date().toLocaleString()}`],
    [],
    // Header row
    ['► INPUTS (edit yellow cells)', 'Value', 'Unit', 'Notes'],
  ], { origin: 'A1' })

  // Input rows — values go in column B; formulas in Sheet 2 reference these cells
  // Row 5 = B5 = system size, Row 6 = B6 = capFactor, ... etc.
  const inputs = [
    ['System Size',          params.sizeKw,           'kW',      'Total generating capacity'],
    ['Capacity Factor',      params.capFactor * 100,  '%',       'Fraction of time at full output'],
    ['Installation Cost',    params.costPerKw,         '$/kW',    'All-in project cost per kilowatt'],
    ['O&M Cost',             params.omRate,            '$/kW/yr', 'Annual operations & maintenance'],
    ['PPA Rate',             params.ppaRate,           '¢/kWh',   'Power purchase agreement price'],
    ['PPA Escalation',       params.escalationRate,    '%/yr',    'Annual increase in PPA rate'],
    ['Degradation Rate',     params.degradationRate,   '%/yr',    'Annual decline in production'],
    ['Debt Ratio',           params.debtPct * 100,     '%',       'Fraction of project financed with debt'],
    ['Interest Rate',        params.interestRate,      '%',       'Annual cost of debt'],
    ['Loan Term',            params.termYears,         'years',   'Debt repayment period'],
    ['Federal ITC',          params.itcPct * 100,      '%',       'Investment Tax Credit (Inflation Reduction Act)'],
    ['Project Life',         25,                       'years',   'Economic lifetime of the project'],
    ['Corporate Tax Rate',   21,                       '%',       'Federal corporate tax rate'],
  ]
  XLSX.utils.sheet_add_aoa(ws1, inputs, { origin: 'A5' })

  // ---- Row indices (1-based, for reference in formulas) ----
  // A5=SystemSize B5=sizeKw, A6=CapFactor B6=capFactor%, A7=InstallCost B7=costPerKw,
  // A8=OMCost B8=omRate, A9=PPA B9=ppaRate, A10=Escal B10=escRate, A11=Degrad B11=degradRate,
  // A12=DebtRatio B12=debtPct%, A13=Interest B13=interestRate, A14=LoanTerm B14=termYears,
  // A15=ITC B15=itcPct%, A16=ProjLife B16=25, A17=TaxRate B17=21

  const R = {
    sizeKw:     'B5',
    capFactor:  'B6',   // as %
    costPerKw:  'B7',
    omRate:     'B8',
    ppaRate:    'B9',
    escalation: 'B10',
    degrad:     'B11',
    debtRatio:  'B12',  // as %
    interest:   'B13',
    loanTerm:   'B14',
    itc:        'B15',  // as %
    projLife:   'B16',
    taxRate:    'B17',
  }

  // ---- Blank + Section header for Results ----
  XLSX.utils.sheet_add_aoa(ws1, [
    [],
    [],
    ['► CALCULATED RESULTS', 'Formula', 'Unit'],
  ], { origin: 'A19' })

  // ---- Result formulas row 22+ ----
  const debtRatioDecimal = `(${R.debtRatio}/100)`
  const taxRateDecimal   = `(${R.taxRate}/100)`
  const capFactorDecimal = `(${R.capFactor}/100)`
  const itcDecimal       = `(${R.itc}/100)`
  const interestDecimal  = `(${R.interest}/100)`
  const degradDecimal    = `(${R.degrad}/100)`

  const formulaRows = [
    ['Total CAPEX',           { f: `${R.sizeKw}*${R.costPerKw}` },                                                       '$'],
    ['Debt Amount',           { f: `B22*${debtRatioDecimal}` },                                                           '$'],
    ['ITC Benefit',           { f: `B22*${itcDecimal}` },                                                                 '$'],
    ['Equity Investment',     { f: `MAX(B22*(1-${debtRatioDecimal})-B24, B22*(1-${debtRatioDecimal})*0.1)` },             '$'],
    ['Annual Production',     { f: `${R.sizeKw}*${capFactorDecimal}*8760` },                                              'kWh'],
    ['Annual Revenue',        { f: `B26*${R.ppaRate}/100` },                                                              '$'],
    ['Annual OpEx',           { f: `${R.sizeKw}*${R.omRate}` },                                                           '$'],
    ['Annual Debt Service',   { f: `IF(${R.debtRatio}=0,0,B23*(${interestDecimal}/12*(1+${interestDecimal}/12)^(${R.loanTerm}*12))/((1+${interestDecimal}/12)^(${R.loanTerm}*12)-1)*12)` }, '$'],
    ['Taxable Income',        { f: `(B27-B28)-(B29*0.5)` },                                                               '$'],
    ['Taxes',                 { f: `MAX(B30*${taxRateDecimal},0)` },                                                      '$'],
    ['Year-1 Equity Cash Flow', { f: `B27-B28-B29-B31` },                                                                '$'],
    ['LCOE',                  { f: `(B22/(${R.sizeKw}*${capFactorDecimal}*8760*${R.projLife}))*100` },                    '¢/kWh'],
    ['Payback Period',        result.payback_years,                                                                        'years (approx)'],
  ]
  XLSX.utils.sheet_add_aoa(ws1, formulaRows, { origin: 'A22' })

  // ---- IRR note row ----
  XLSX.utils.sheet_add_aoa(ws1, [
    [],
    ['IRR', { f: 'IRR(CF!B2:B26,-B25)' }, '%', '← Excel IRR from CashFlows sheet'],
    ['NPV (8%)', { f: 'NPV(0.08,CF!B2:B26)-B25' }, '$', '← Excel NPV from CashFlows sheet'],
  ], { origin: 'A36' })

  // Column widths
  ws1['!cols'] = [
    { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 42 }
  ]

  XLSX.utils.book_append_sheet(wb, ws1, 'Project Model')

  // ---- Sheet 2: CashFlows (25-year projection with formulas) ----
  const ws2 = XLSX.utils.aoa_to_sheet([])
  XLSX.utils.sheet_add_aoa(ws2, [
    ['Year', 'Equity Cash Flow ($)', 'Notes'],
    [0, { f: `-'Project Model'!B25` }, 'Equity Investment (Year 0)'],
  ], { origin: 'A1' })

  // 25 years of formula-driven cash flows
  const cfRows = []
  for (let yr = 1; yr <= 25; yr++) {
    const prodFormula = `'Project Model'!${R.sizeKw}*('Project Model'!${R.capFactor}/100)*8760*(1-'Project Model'!${R.degrad}/100)^(${yr}-1)`
    const rateFormula = `'Project Model'!${R.ppaRate}*(1+'Project Model'!${R.escalation}/100)^(${yr}-1)/100`
    const revenueFormula = `(${prodFormula})*(${rateFormula})`
    const opexFormula   = `'Project Model'!${R.sizeKw}*'Project Model'!${R.omRate}`
    const dsFormula     = `IF(${yr}<='Project Model'!${R.loanTerm},'Project Model'!B29,0)`
    const taxableFormula = `((${revenueFormula})-(${opexFormula}))-(${dsFormula}*0.5)`
    const taxFormula    = `MAX((${taxableFormula})*'Project Model'!${R.taxRate}/100,0)`
    const cfFormula     = `(${revenueFormula})-(${opexFormula})-(${dsFormula})-(${taxFormula})`

    cfRows.push([yr, { f: cfFormula }, yr <= 25 ? '' : ''])
  }
  XLSX.utils.sheet_add_aoa(ws2, cfRows, { origin: 'A3' })

  // Also add human-readable actual values at the side for reference
  XLSX.utils.sheet_add_aoa(ws2, [[], ['← Note: Column B uses Excel formulas. Change inputs in "Project Model" sheet to recalculate.']], { origin: 'A29' })

  ws2['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 60 }]

  XLSX.utils.book_append_sheet(wb, ws2, 'CF')

  // ---- Sheet 3: Sensitivity (IRR at ±30% variations) ----
  const ws3 = XLSX.utils.aoa_to_sheet([])
  const ppaVars   = [-30, -20, -10, 0, 10, 20, 30]
  const cfVars    = [30, 20, 10, 0, -10, -20, -30]

  const sensHeader = ['CF ↕ / PPA →', ...ppaVars.map(v => `${v >= 0 ? '+' : ''}${v}%`)]
  const sensRows   = [sensHeader]

  cfVars.forEach(cfVar => {
    const row = [`${cfVar >= 0 ? '+' : ''}${cfVar}%`]
    ppaVars.forEach(ppaVar => {
      const adjCap = params.capFactor * (1 + cfVar / 100)
      const adjPpa = params.ppaRate * (1 + ppaVar / 100)
      const irrVal = estimateIRR(adjCap, adjPpa, params)
      row.push(Number(irrVal.toFixed(1)))
    })
    sensRows.push(row)
  })

  XLSX.utils.sheet_add_aoa(ws3, [
    ['SENSITIVITY ANALYSIS — IRR % at Capacity Factor × PPA Rate Variations'],
    ['Base case highlighted. Values show estimated IRR (%).'],
    [],
    ...sensRows
  ], { origin: 'A1' })

  ws3['!cols'] = [{ wch: 14 }, ...ppaVars.map(() => ({ wch: 10 }))]

  XLSX.utils.book_append_sheet(wb, ws3, 'Sensitivity')

  // ---- Download ----
  XLSX.writeFile(
    wb,
    `Project-${state}-${(params.sizeKw / 1000).toFixed(1)}MW-${new Date().toISOString().split('T')[0]}.xlsx`
  )
}

// Lightweight IRR estimator (mirrors calcLocally logic) for sensitivity sheet
function estimateIRR(capFactor, ppaRate, params) {
  const totalCapex  = params.sizeKw * params.costPerKw
  const debt        = totalCapex * params.debtPct
  const equity      = Math.max(totalCapex * (1 - params.debtPct) - totalCapex * params.itcPct, totalCapex * (1 - params.debtPct) * 0.1)
  const annualProd  = params.sizeKw * capFactor * 8760
  const revenue     = annualProd * ppaRate / 100
  const opex        = params.sizeKw * params.omRate / 1000
  const i           = params.interestRate / 100
  const n           = params.termYears * 12
  const mr          = i / 12
  const ds          = mr > 0
    ? debt * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1) * 12
    : debt / params.termYears
  const cf          = (revenue - opex) - ds - Math.max(((revenue - opex) - ds * 0.5) * 0.21, 0)
  if (equity <= 0) return 0
  return Math.min(Math.max((cf / equity) * 110, 5), 35)
}
