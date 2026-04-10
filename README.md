# CDF AI Engineering Hackathon - U.S. Renewable Energy Investment Dashboard

**Live URL**: https://cdf-deploy-jash.vercel.app
**Submission Deadline**: April 12, 2026 at 1:00 PM EST

---

## 📋 Project Overview

A multi-tab investment analysis dashboard for U.S. renewable energy projects, built with React + FastAPI. Integrates live public APIs (EIA, NREL) with AI-powered research and financial modeling.

## 🚀 Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
export ANTHROPIC_API_KEY=your_key_here
python3 -m uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`

---

## 📦 Submission Checklist

- [ ] **Live deployment URL** - added at top of README
- [ ] **Planning document** ✅ - [planning/PLANNING.md](planning/PLANNING.md)
- [ ] **Application code** ✅ - [backend/](backend/) + [frontend/](frontend/)
- [ ] **Architecture doc** - [docs/architecture.md](docs/architecture.md)
- [ ] **Walkthrough video** - [docs/walkthrough.md](docs/walkthrough.md)
- [ ] **Reflection doc** - [docs/reflection.md](docs/reflection.md)
- [ ] **Clean git history** - commits track progress by feature

---

## 📁 Repository Structure

```
cdf-dashboard/
├── README.md                    # This file
├── PROBLEM_STATEMENT.md         # Full hackathon brief
├── planning/
│   └── PLANNING.md              # Detailed planning + tech stack justification
├── docs/
│   ├── architecture.md          # System design & data flow
│   ├── walkthrough.md           # Link to 5-min demo video
│   └── reflection.md            # What was built, tradeoffs, AI tools
├── backend/
│   ├── main.py                  # FastAPI app
│   ├── requirements.txt         # Python dependencies
│   └── .env                     # API keys (NOT committed)
└── frontend/
    ├── src/
    │   ├── components/          # React components (Tabs, Charts, Map)
    │   ├── api/                 # API client functions
    │   └── App.jsx
    └── package.json
```

---

## 🏗️ Architecture Overview

See [docs/architecture.md](docs/architecture.md) for detailed system design.

**Quick Summary:**
- **Tab 1**: Market Overview (live electricity prices, capacity trends)
- **Tab 2**: Project Calculator (IRR, NPV, LCOE with instant client-side calculations — no server roundtrip)
- **Tab 3**: AI Research Assistant (Claude with live market data context)
- **Tab 4**: Geographic Map (D3 choropleth — total renewable capacity heatmap, clickable states)
- **Cross-Tab Flow**: Geographic state click → updates Calculator location; Calculator state → AI Research context

---

## 🛠️ Tech Stack

| Component | Tech | Reason |
|-----------|------|--------|
| **Frontend** | React 18 + Vite | Fast HMR, modern ecosystem (Chart.js, Leaflet) |
| **Backend** | Python FastAPI | Async API calls, fast deployment |
| **Maps** | D3.js + TopoJSON | Choropleth rendering, no API key, full control |
| **Charts** | Chart.js + react-chartjs-2 | Interactive, responsive |
| **AI** | Anthropic Claude API | Free $5 credit, excellent for analysis |
| **Public APIs** | EIA, NREL, OpenEI | Live renewable energy market data |

---

## 📊 Tier 1 Requirements Status

- [x] **Tab 1: Market Overview** - Status dashboard with live EIA data
- [x] **Tab 2: Project Calculator** - Solar/wind financial model with IRR/NPV/LCOE
- [x] **Tab 3: Research Assistant** - Claude AI with market context
- [x] **Tab 4: Geographic Map** - Interactive US map with overlays
- [x] **Cross-Tab Data Flow** - Calculator → Market Overview → AI Research
- [ ] **Live Deployment** - *(pending)*

---

## 🎯 Evaluation Breakdown

| Criterion | Weight | How We Address It |
|-----------|--------|-------------------|
| **AI Integration** | 25% | Claude research assistant with live market data context, cites sources |
| **Technical Architecture** | 25% | Clean FastAPI backend, React components, cross-tab data flow, caching |
| **UI/UX & Data Viz** | 20% | Professional design, Chart.js + D3 choropleth map, responsive, loading states |
| **Data Engineering** | 15% | EIA + NREL APIs integrated, error handling, rate limit mitigation |
| **Project Management** | 15% | Planning doc, clean git history, architecture doc, this README |

---

## 📚 Documentation

1. **[planning/PLANNING.md](planning/PLANNING.md)** - Tech stack justification, phases, prioritization
2. **[docs/architecture.md](docs/architecture.md)** - System design, data flow, endpoint specs
3. **[docs/walkthrough.md](docs/walkthrough.md)** - Link to 5-minute demo video
4. **[docs/reflection.md](docs/reflection.md)** - What was built, tradeoffs, AI tools used

---

## 🔑 Environment Variables

Create `.env` files in both backend and frontend (never commit):

### backend/.env
```
ANTHROPIC_API_KEY=sk-ant-...
EIA_API_KEY=...
NREL_API_KEY=...
FRED_API_KEY=... (optional)
```

### frontend/.env (if needed)
```
VITE_API_URL=http://localhost:8000
```

---

## 📝 Git Commit History

Commits follow this pattern:
- `Setup: Initialize project structure`
- `Backend: Integrate EIA API for market data`
- `Frontend Tab 1: Build Market Overview component`
- `Frontend Tab 2: Build Project Calculator`
- `Frontend Tab 3: Integrate Claude research assistant`
- `Frontend Tab 4: Build geographic map`
- `Cross-tab: Wire data flow between components`

Each commit represents a meaningful feature or fix, making progress traceable.

---

## 🚫 What NOT to Commit

Never commit to the repo:
- `.env` files (API keys)
- `node_modules/`
- `venv/` (Python virtual env)
- `.DS_Store`
- IDE settings (`.vscode/`, `.idea/`)

See `.gitignore` for full list.

---

## 📞 Questions?

For help with Claude Code or debugging, visit: https://github.com/anthropics/claude-code/issues

---

**Built with ❤️ using Claude Code**
