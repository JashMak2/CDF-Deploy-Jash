import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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

export async function generateProjectPDF(
  type,
  state,
  calculator_result,
  scenario,
  memoText
) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const maxWidth = pageWidth - 2 * margin
  let yPos = margin

  // Helper function to add a new page if needed
  const checkPageBreak = (needed = 35) => {
    if (yPos + needed > pageHeight - 10) {
      pdf.addPage()
      yPos = margin
      return true
    }
    return false
  }

  // ----- SECTION 1: HEADER -----
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Renewable Energy Project Report', margin, yPos)

  yPos += 8
  pdf.setFontSize(11)
  pdf.setFont('Helvetica', 'normal')
  pdf.text(
    `${type.toUpperCase()} · ${STATE_NAMES[state] || state} · ${(calculator_result.system_size_kw / 1000).toFixed(1)} MW`,
    margin,
    yPos
  )

  yPos += 6
  pdf.setFontSize(9)
  pdf.setTextColor(100, 100, 100)
  pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPos)
  pdf.setTextColor(0, 0, 0)

  yPos += 10

  // ----- SECTION 2: EXECUTIVE SUMMARY -----
  checkPageBreak()
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Executive Summary', margin, yPos)
  yPos += 7

  pdf.setFont('Helvetica', 'normal')
  pdf.setFontSize(10)

  const summaryMetrics = [
    ['IRR', `${calculator_result.irr_pct?.toFixed(1)}%`],
    ['NPV (8% discount)', `$${(calculator_result.npv_usd / 1000000).toFixed(1)}M`],
    ['LCOE', `${calculator_result.lcoe_cents_per_kwh?.toFixed(1)}¢/kWh`],
    ['Payback Period', `${calculator_result.payback_years?.toFixed(1)} years`],
    ['Annual Revenue', `$${(calculator_result.annual_revenue_usd / 1000000).toFixed(2)}M`],
    ['Annual Production', `${(calculator_result.annual_production_kwh / 1000000).toFixed(1)}M kWh/yr`],
  ]

  summaryMetrics.forEach(([label, value]) => {
    pdf.setFont('Helvetica', 'normal')
    pdf.text(label + ':', margin, yPos)
    pdf.setFont('Helvetica', 'bold')
    pdf.text(value, margin + 55, yPos)
    yPos += 6
  })

  yPos += 5

  // ----- SECTION 3: PROJECT INPUTS -----
  checkPageBreak(45)
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Project Inputs', margin, yPos)
  yPos += 7

  pdf.setFont('Helvetica', 'normal')
  pdf.setFontSize(9)

  const inputRows = [
    ['Technology', type.toUpperCase()],
    ['Location', STATE_NAMES[state] || state],
    ['System Size', `${(calculator_result.system_size_kw / 1000).toFixed(1)} MW`],
    ['Capacity Factor', `${(calculator_result.capacity_factor * 100).toFixed(1)}%`],
    ['Installation Cost', `$${calculator_result.cost_per_kw || 2000}/kW`],
    ['PPA Rate', `${calculator_result.ppa_rate_cents_kwh || 12}¢/kWh`],
    ['O&M Cost', `${calculator_result.om_rate || 15}$/kW-yr`],
    ['Degradation Rate', `${calculator_result.degradation_rate_pct?.toFixed(1)}%/yr`],
    ['PPA Escalation', `${calculator_result.escalation_rate_pct?.toFixed(1)}%/yr`],
    ['Debt Ratio', `${(calculator_result.debt_pct * 100)?.toFixed(0)}%`],
    ['Interest Rate', `${calculator_result.interest_rate_pct?.toFixed(1)}%`],
    ['Loan Term', `${calculator_result.term_years || 20} years`],
    ['Federal ITC', `${(calculator_result.itc_pct * 100)?.toFixed(0)}%`],
  ]

  inputRows.forEach(([label, value]) => {
    pdf.setFont('Helvetica', 'normal')
    pdf.text(label + ':', margin, yPos)
    pdf.setFont('Helvetica', 'bold')
    pdf.text(String(value), margin + 65, yPos)
    yPos += 5
  })

  yPos += 5

  // ----- SECTION 4: CALCULATED RESULTS -----
  checkPageBreak(50)
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Financial Results', margin, yPos)
  yPos += 7

  pdf.setFont('Helvetica', 'normal')
  pdf.setFontSize(9)

  const resultRows = [
    ['Total CAPEX', `$${(calculator_result.total_capex_usd / 1000000).toFixed(1)}M`],
    ['Debt Financing', `$${(calculator_result.debt_usd / 1000000).toFixed(1)}M`],
    ['Equity Investment', `$${(calculator_result.equity_usd / 1000000).toFixed(1)}M`],
    ['ITC Benefit', `$${(calculator_result.itc_benefit_usd / 1000000).toFixed(2)}M`],
    ['Annual Revenue', `$${(calculator_result.annual_revenue_usd / 1000000).toFixed(2)}M`],
    ['Annual OpEx', `$${(calculator_result.annual_opex_usd / 1000000).toFixed(2)}M`],
    ['Annual Debt Service', `$${(calculator_result.annual_debt_service_usd / 1000000).toFixed(2)}M`],
    ['Annual Net Cash Flow', `$${(calculator_result.annual_net_cash_flow_usd / 1000000).toFixed(2)}M`],
    ['NPV (8% discount)', `$${(calculator_result.npv_usd / 1000000).toFixed(1)}M`],
    ['IRR', `${calculator_result.irr_pct?.toFixed(1)}%`],
    ['LCOE', `${calculator_result.lcoe_cents_per_kwh?.toFixed(1)}¢/kWh`],
    ['Payback Period', `${calculator_result.payback_years?.toFixed(1)} years`],
  ]

  resultRows.forEach(([label, value]) => {
    pdf.setFont('Helvetica', 'normal')
    pdf.text(label + ':', margin, yPos)
    pdf.setFont('Helvetica', 'bold')
    pdf.text(String(value), margin + 65, yPos)
    yPos += 5
  })

  yPos += 5

  // ----- SECTION 5: 25-YEAR CASH FLOW SUMMARY -----
  checkPageBreak(50)
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('25-Year Annual Cash Flows (Summary)', margin, yPos)
  yPos += 7

  if (calculator_result.cash_flows && calculator_result.cash_flows.length > 0) {
    pdf.setFont('Helvetica', 'normal')
    pdf.setFontSize(8)

    // Show years 1-10 in detail, then yearly summary
    const flowsToShow = calculator_result.cash_flows.slice(0, 10)
    const totalFlow = calculator_result.cash_flows.reduce((sum, cf) => sum + cf.cf, 0)

    flowsToShow.forEach((cf) => {
      const year = String(cf.year)
      const amount = `$${(cf.cf / 1000).toFixed(0)}K`
      pdf.text(`Year ${year}: ${amount}`, margin, yPos)
      yPos += 4
    })

    yPos += 2
    pdf.setFont('Helvetica', 'bold')
    pdf.text(`Total 25-Year Cash Flow: $${(totalFlow / 1000000).toFixed(1)}M`, margin, yPos)
    yPos += 6
  }

  // ----- SECTION 6: SENSITIVITY MATRIX -----
  checkPageBreak(50)
  pdf.setFont('Helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Sensitivity Analysis: IRR % at PPA Rate vs Capacity Factor Variations', margin, yPos)
  yPos += 7

  // Try to capture sensitivity table from DOM if available
  try {
    const sensTableDiv = document.querySelector('.sensitivity-table')
    if (sensTableDiv) {
      const canvas = await html2canvas(sensTableDiv, {
        useCORS: true,
        allowTaint: true,
        scale: 1.5
      })
      const imgData = canvas.toDataURL('image/png')
      const imgWidth = maxWidth - 4
      const imgHeight = (canvas.height / canvas.width) * imgWidth

      if (yPos + imgHeight > pageHeight - 15) {
        pdf.addPage()
        yPos = margin
      }

      pdf.addImage(imgData, 'PNG', margin + 2, yPos, imgWidth - 4, imgHeight)
      yPos += imgHeight + 5
    }
  } catch (e) {
    console.warn('Could not capture sensitivity matrix:', e)
  }

  // ----- SECTION 7: INVESTMENT MEMO (if provided) -----
  if (memoText && memoText.trim()) {
    yPos += 5
    checkPageBreak(50)
    pdf.setFont('Helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text('Investment Memo', margin, yPos)
    yPos += 7

    pdf.setFont('Helvetica', 'normal')
    pdf.setFontSize(9)

    // Split memo text and add with text wrapping
    const memoLines = pdf.splitTextToSize(memoText, maxWidth)
    memoLines.forEach(line => {
      if (yPos + 4 > pageHeight - 10) {
        pdf.addPage()
        yPos = margin
      }
      pdf.text(line, margin, yPos)
      yPos += 4
    })
  }

  // ----- FOOTER -----
  const addFooter = () => {
    pdf.setFont('Helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(150, 150, 150)
    const pageCount = pdf.internal.pages.length - 1
    pdf.text(`Page ${pageCount}`, pageWidth - margin - 15, pageHeight - 7)
    pdf.text('Data Sources: EIA API, NREL Database | For educational/investment analysis purposes', margin, pageHeight - 7)
  }

  // Add footer to all pages
  for (let i = 2; i <= pdf.internal.pages.length - 1; i++) {
    pdf.setPage(i)
    addFooter()
  }

  // Add footer to first page
  pdf.setPage(1)
  addFooter()

  // ----- SAVE PDF -----
  const filename = `Project-${state}-${(calculator_result.system_size_kw / 1000).toFixed(1)}MW-${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}
