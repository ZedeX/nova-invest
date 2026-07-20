# nova-invest

> AI-powered investment platform for Prosumers. Phase 1 MVP running entirely on Cloudflare's free tier.
>
> 📖 **For the full project README with architecture diagrams, feature overview,
> and quick start guide, see the [root README.md](../README.md).**
>
> 🌐 中文版请见 [README.zh-CN.md](../README.zh-CN.md)
>
> This `web/README.md` focuses on **developer setup, deployment, and
> web/-specific commands**. For product vision, ADR index, and
> anti-hallucination documentation, see the root README.

---

## What is this?

`nova-invest` is a Prosumer-grade AI investment platform that combines:

- **Agent Harness** — 9-layer architecture (UI → Orchestration → Loop → Planning → Tools → Memory → RAG → LLM → Observability)
- **Strategy DSL** — YAML-based strategy definition with JSON Schema validation
- **Playbook System** — Composable, versioned packages (SemVer) of strategies + risk managers + data fetchers
- **Paper Broker** — Simulated broker with 5bps slippage; real broker integration via MCP server in Phase 2
- **Ask Agent** — Multi-step reasoning with citation validation and anti-hallucination
- **Community Feed** — Publish, discover, install, rate community-shared Playbooks

This is a personal learning project (Phase 1: 0–6 months) that doubles as a Product Lead job application portfolio. It is **not investment advice**.

---

## Tech Stack

| Layer        | Technology                                             |
|--------------|--------------------------------------------------------|
| Frontend     | Next.js 16, React 19, Tailwind 4, TypeScript 5         |
| Chart        | SVG (Phase 1) → TradingView lightweight-charts (1.5+)  |
| Backend      | Cloudflare Workers (`@opennextjs/cloudflare`)          |
| Database     | Cloudflare D1 (SQLite edge)                            |
| Vector DB    | Cloudflare Vectorize (within free tier)                |
| Object Store | Cloudflare R2 (cache for 10 Mock symbols only)        |
| KV           | Cloudflare KV (session + short-term Agent memory)      |
| LLM (Local)  | LM Studio (qwen2.5-14b-instruct)                       |
| LLM (Cloud)  | Volcano Engine Ark (Doubao), Claude, GPT, Gemini       |
| Agent        | Multi-Agent + Supervisor pattern                       |
| Tools        | MCP (external) + native function call (internal)      |
| DSL          | YAML + JSON Schema (draft-07)                          |
| Observability| OpenTelemetry + Grafana                                |

---

## Mock / Real Mode

All external dependencies are abstracted behind a Provider interface. Toggle via `USE_MOCK` env var:

| Mode            | `USE_MOCK` | Data Source                | LLM                  | Credit Cost |
|-----------------|-----------|----------------------------|----------------------|-------------|
| Mock (default)  | `true`    | Pre-generated JSON         | Pre-written samples  | 0           |
| Real            | `false`   | Yahoo / Alpha Vantage      | Volcano Ark / Claude | Per-action  |

Switch at runtime on the [Settings page](./src/app/settings/page.tsx).

### Mock data

10 symbols are pre-generated using geometric Brownian motion:

```
AAPL  MSFT  NVDA  GOOG  META  AMZN  TSLA  NFLX  AMD  INTC
```

Regenerate via:
```bash
python scripts/generate_mock_data.py
```

---

## Project Structure

```
nova-invest/
├── docs/
│   ├── architecture/
│   │   └── architecture.md              # 9-layer Agent Harness architecture
│   ├── prd/
│   │   ├── Master_PRD.md                 # Top-level PRD
│   │   ├── epic/
│   │   │   ├── 01_AgentHarness.md
│   │   │   ├── 02_DataLayer.md
│   │   │   ├── 03_Ask_Agent.md
│   │   │   ├── 04_Strategy_DSL.md
│   │   │   ├── 05_Dashboard.md
│   │   │   ├── 06_Broker_Integration.md
│   │   │   ├── 07_Share_Community.md
│   │   │   └── 08_Playbook_System.md
│   │   └── appendix/
│   │       ├── billing_credit_system.md
│   │       ├── compliance_legal.md
│   │       ├── deployment_cloudflare.md
│   │       └── glossary.md
│   ├── spec/
│   │   ├── data_model.md                # 27-table D1 schema
│   │   ├── strategy_dsl_spec.md          # DSL spec + JSON Schema + BNF
│   │   └── api_spec.md                   # 50+ API endpoints
│   └── roadmap/
│       └── Roadmap.md                   # 3-phase, 18-month plan
├── scripts/
│   └── generate_mock_data.py
└── web/
    ├── src/
    │   ├── app/                          # Next.js App Router pages
    │   ├── components/
    │   │   ├── layout/                   # Header, Sidebar, MockBadge
    │   │   └── widgets/                  # KlineChart, AskAgentPanel, etc.
    │   └── lib/
    │       ├── env.ts                    # Cloudflare bindings + isMockMode()
    │       ├── types.ts                  # TypeScript types for all 8 modules
    │       ├── data/provider.ts          # MarketDataProvider (Mock/Real)
    │       └── llm/router.ts             # LLM routing + MockLLM/RealLLM
    ├── public/mock/                      # Pre-generated Mock datasets
    ├── wrangler.toml                     # Cloudflare deployment config
    └── package.json
```

---

## Quickstart (Local Dev)

### Prerequisites

- Node.js 20+
- pnpm 9+
- (Optional) Python 3.11+ for regenerating Mock data
- (Optional) [LM Studio](https://lmstudio.ai/) for local LLM

### Install & Run

```bash
cd web
pnpm install
pnpm dev
# → http://localhost:3000
```

The app starts in **Mock mode** by default. No external API keys required.

### Switch to Real Mode

1. Start LM Studio locally, or obtain a Volcano Engine Ark API key.
2. Set environment variables:
   ```bash
   export USE_MOCK=false
   export VOLCANO_ARK_API_KEY=...
   # or for local LM Studio:
   export LLM_PROVIDER=local-lmstudio
   ```
3. Restart `pnpm dev`.

---

## Deploy to Cloudflare

### One-time setup

```bash
# Install OpenNext for Cloudflare
pnpm add -D @opennextjs/cloudflare

# Login + create resources
npx wrangler login
npx wrangler d1 create nova-invest-db
npx wrangler r2 bucket create nova-invest-cache
npx wrangler kv namespace create KV
npx wrangler vectorize create nova-invest-vec --dimensions 768 --metric cosine

# Update wrangler.toml with returned IDs (replace REPLACE_WITH_* placeholders)
```

### Deploy

```bash
pnpm build
npx wrangler deploy
# → https://nova-invest-web.<your-subdomain>.workers.dev
```

### Free Tier Constraints

See [docs/prd/appendix/deployment_cloudflare.md](./docs/prd/appendix/deployment_cloudflare.md) for the full free tier capacity table and capacity planning notes.

---

## Documentation

| Document | Audience |
|----------|----------|
| [Master PRD](./docs/prd/Master_PRD.md) | CPO / CEO / Investors |
| [8 Epics](./docs/prd/epic/) | Engineering team |
| [Architecture](./docs/architecture/architecture.md) | Engineering team |
| [Roadmap](./docs/roadmap/Roadmap.md) | PM / Eng leadership |
| [Specs](./docs/spec/) | Engineering team |
| [Appendices](./docs/prd/appendix/) | All (billing, legal, ops, glossary) |

---

## Roadmap

| Phase | Months | Goal |
|-------|--------|------|
| 1 — PMF Validation | 0–6  | Mock-mode MVP on Cloudflare free tier |
| 2 — PMF Scaling    | 7–12 | Real broker + paid tier + community growth |
| 3 — Platform化     | 13–18 | Open ecosystem + mobile + international |

See [Roadmap.md](./docs/roadmap/Roadmap.md) for full sprint breakdown.

---

## KPI Tree

- **North Star**: WAU-CW (Weekly Active Users — Complete Workflow)
- **Business**: ARR, paying users, average Credit burn
- **Health**: Free→Paid conversion, 30-day retention, Playbook shares
- **Quality**: Hallucination rate, citation accuracy, Agent latency p95
- **Community**: Installs per Playbook, rating distribution, report resolution time

---

## Regulatory Positioning

nova-invest operates as a **Publisher + Tech Platform**, not a Registered Investment Advisor (RIA). All AI-generated content includes disclaimers. Paper trading is for educational purposes only and is **not investment advice**. See [compliance_legal.md](./docs/prd/appendix/compliance_legal.md).

---

## License

MIT — see [LICENSE](./LICENSE).

## Disclaimer

This software is for educational and demonstration purposes only. It does not constitute investment advice. Past performance is not indicative of future results. Trading involves substantial risk of loss.
