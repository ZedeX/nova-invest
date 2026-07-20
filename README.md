# Nova Invest

> **Turn natural language into verifiable trading strategies.**
>
> An AI-native investment research workstation that takes you from
> *information* → *judgment* → *strategy* → *monitoring* in one workflow.

[![CI](https://github.com/ZedeX/nova-invest/actions/workflows/tests.yml/badge.svg)](https://github.com/ZedeX/nova-invest/actions/workflows/tests.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

![Nova Invest Hero Banner](./docs/assets/hero-banner.svg)

---

## ✨ What is Nova Invest?

**Nova Invest** is an AI-native investment research workstation that collapses
the traditional multi-tool research workflow (Bloomberg + Excel + TradingView +
ChatGPT + Discord) into a single, opinionated platform. Three core capabilities,
one continuous flow:

| # | Capability | Entry Point | Frequency |
|---|------------|-------------|-----------|
| 1 | **Ask** — Deep Research | Natural-language question | One-shot |
| 2 | **Build Strategy** — NL → DSL → Backtest | NL description + DSL editor | Iterative |
| 3 | **Build Dashboard** — Monitoring | Pinned strategy + signal config | Long-term |

### One Example Workflow

> *"Should I buy NVDA at current levels?"*

1. **Ask** — Type the question. The Ask Agent pulls SEC filings, news, and
   price data via RAG, then returns a structured answer with **every numeric
   fact tied to a verifiable citation** (no hallucinated numbers).
2. **Build Strategy** — Describe your thesis in plain English:
   *"Buy NVDA when 20-day SMA crosses above 50-day SMA AND RSI(14) < 30"*.
   The system translates it into a composable YAML DSL, then backtests against
   10+ years of historical data with full metrics (Sharpe, Sortino, max
   drawdown, win rate, profit factor).
3. **Build Dashboard** — Pin the validated strategy to your dashboard. Get
   real-time signals, execute paper trades, monitor positions — all in one
   workspace.
4. **Share** — Publish your strategy as a versioned "Playbook" (SemVer) to
   the community. Install others' Playbooks, rate and comment. Think
   *"GitHub for trading strategies"*.

> 💡 **Design philosophy**: Every numeric value in an AI answer is traced back
> to a verifiable source citation. No hallucinated numbers, ever.
> ([ADR-0007 Anti-Hallucination Enforcer](./docs/architecture/adr-0007-citation-validator.md))

---

## 🎯 Why Nova Invest?

### The Problem

Retail and prosumer investors today juggle 5+ tools to answer a single question
like *"Should I buy NVDA at current levels?"*:

- ❌ ChatGPT hallucinates financial numbers with confident tone
- ❌ Yahoo Finance gives data but no analysis
- ❌ TradingView shows charts but no natural-language Q&A
- ❌ Excel backtests are disconnected from real-time data
- ❌ Discord/Reddit signal groups have no audit trail

### The Nova Invest Way

✅ **Ask Agent** — natural-language deep research with **3-stage citation
validation** (structural + quote-substring + URL-reachability). Every number
links to a verifiable SEC EDGAR / Yahoo Finance / Bloomberg source.

✅ **Strategy DSL** — describe your thesis in plain English, the system
translates it into a composable YAML DSL (`sma(20) > sma(50) AND rsi(14) < 30`),
then backtests against 10+ years of historical data.

✅ **Live Dashboard** — pin your validated strategy, get real-time signals,
execute paper trades, monitor positions — all in one workspace.

✅ **Community Playbooks** — share your strategy as a versioned "Playbook"
(SemVer), install others' Playbooks, rate and comment. Think *"GitHub for
trading strategies"*.

---

## 📸 Product Screenshots

Actual UI running in Mock mode (no API keys required):

| Dashboard | Ask Agent |
|:---------:|:---------:|
| ![Dashboard](./docs/assets/01-dashboard.png) | ![Ask Agent](./docs/assets/02-ask-agent.png) |

| Strategy Editor | Chart View (AAPL) |
|:---------------:|:-----------------:|
| ![Strategy](./docs/assets/03-strategy.png) | ![Chart AAPL](./docs/assets/04-chart-aapl.png) |

| Backtest | Community |
|:--------:|:---------:|
| ![Backtest](./docs/assets/05-backtest.png) | ![Community](./docs/assets/06-community.png) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 9.0.0
- **Python** ≥ 3.10 (only for mock data regeneration)

### Install & Run (Mock Mode — Zero API Keys Needed)

```bash
git clone https://github.com/ZedeX/nova-invest.git
cd nova-invest/web
pnpm install
pnpm mock:generate    # generate 10 symbols × 1d klines + 5 QA samples
pnpm dev              # http://localhost:3000
```

That's it. The `USE_MOCK=true` mode (default) requires **no external API keys,
no Cloudflare bindings, no database** — perfect for local development and demos.

### Production Deploy (Cloudflare Workers + D1 + R2 + Vectorize)

```bash
cd web
cp .env.example .env.production      # fill in your API keys
pnpm cf:create                       # create D1 + R2 + KV + Vectorize resources
pnpm db:migrate:prod                 # apply 9 migrations (25 tables)
pnpm db:seed                         # seed 10 mockup symbols + test user
pnpm deploy                          # wrangler deploy to Cloudflare
```

📖 **Full deployment guide**: [docs/prd/appendix/deployment_cloudflare.md](./docs/prd/appendix/deployment_cloudflare.md)

---

## 🏗️ Architecture at a Glance

![Architecture Diagram](./docs/assets/architecture-diagram.svg)

### Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Frontend** | Next.js 16.2 + React 19.2 + Tailwind 4 | App Router + RSC for streaming SSR |
| **Edge Runtime** | Cloudflare Workers 4 | Sub-50ms global edge, pay-per-request |
| **Database** | Cloudflare D1 (SQLite) | 25 tables, 5GB free tier, SQL FK enforcement |
| **Object Storage** | Cloudflare R2 | K-line cache, Playbook YAML, no egress fees |
| **Vector DB** | Cloudflare Vectorize | RAG embeddings for SEC filings + news |
| **Session State** | Cloudflare KV | Short-term memory + circuit breaker counters |
| **LLM Routing** | LM Studio (local) / Volcengine Ark (cloud) / Mock | Cost-capped routing with pro→lite auto-degrade |

### Data Flow: 4-Tier Fallback

When you request market data (e.g. AAPL K-line), the system tries each tier in
order until one succeeds:

```
R2 Cache (instant, free)
   ↓ miss
Yahoo Finance (free, real-time)
   ↓ rate-limited
Alpha Vantage (freemium, key-required)
   ↓ unreachable
Mock Provider (local JSON, always works)
```

This guarantees the UI always renders, even when every external API is down.
See [ADR-0002 R2 Cache Whitelist](./docs/architecture/adr-0002-r2-cache-whitelist.md)
and [ADR-0016 Circuit Breaker](./docs/architecture/adr-0016-circuit-breaker.md).

### LLM Routing: Cost Cap + Auto-Degrade

Every query is classified into one of four intents, each with its own model
tier and cost cap:

| Intent | Local Model | Cloud Model | Cost Cap |
|--------|-------------|-------------|----------|
| `simple_qa` | qwen2.5-7b | doubao-lite-4k | $0.001 |
| `deep_research` | qwen2.5-32b | doubao-pro-32k | $0.05 |
| `tool_call` | qwen2.5-7b | doubao-pro-32k | $0.01 |
| `clarify` | qwen2.5-7b | doubao-lite-4k | $0.0005 |

Before each call, `estimateCost()` runs. If the estimate exceeds the cap, the
model auto-degrades (pro → lite, 10× cheaper). See
[ADR-0003 LLM Routing + Cost Cap](./docs/architecture/adr-0003-llm-routing-cost-cap.md).

### The 16 ADRs (Architecture Decision Records)

Every major technical decision is documented as an ADR. The full registry
lives at [docs/architecture/](./docs/architecture/).

| # | ADR | Domain | Status |
|---|-----|--------|--------|
| 0001 | [USE_MOCK Dual-Mode Switch](./docs/architecture/adr-0001-use-mock-dual-mode-switch.md) | Cross-cutting | Accepted |
| 0002 | [R2 Cache Whitelist](./docs/architecture/adr-0002-r2-cache-whitelist.md) | Data Layer | Accepted |
| 0003 | [LLM Routing + Cost Cap](./docs/architecture/adr-0003-llm-routing-cost-cap.md) | Ask Agent | Accepted |
| 0004 | [Agent Loop Design](./docs/architecture/adr-0004-agent-loop-design.md) | Ask Agent | Accepted |
| 0005 | [Memory Layer (KV + D1)](./docs/architecture/adr-0005-memory-layer.md) | Ask Agent | Accepted |
| 0006 | [Tool Protocol](./docs/architecture/adr-0006-tool-protocol.md) | Ask Agent | Accepted |
| 0007 | [Citation Validator (Anti-Hallucination)](./docs/architecture/adr-0007-citation-validator.md) | Ask Agent | Accepted |
| 0008 | [Strategy DSL Schema](./docs/architecture/adr-0008-strategy-dsl-schema.md) | Strategy | Accepted |
| 0009 | [Backtest Engine](./docs/architecture/adr-0009-backtest-engine.md) | Strategy | Accepted |
| 0010 | [Dashboard Layout](./docs/architecture/adr-0010-dashboard-layout.md) | Dashboard | Accepted |
| 0011 | [D1 Schema Master (25 tables)](./docs/architecture/adr-0011-d1-schema-master.md) | Data Layer | Accepted |
| 0012 | [Community UGC](./docs/architecture/adr-0012-community-ugc.md) | Community | Accepted |
| 0013 | [Playbook System](./docs/architecture/adr-0013-playbook-system.md) | Playbook | Accepted |
| 0014 | [Ask RAG Pipeline](./docs/architecture/adr-0014-ask-rag-pipeline.md) | Ask Agent | Accepted |
| 0015 | [SSE Streaming](./docs/architecture/adr-0015-sse-streaming.md) | Cross-cutting | Accepted |
| 0016 | [Circuit Breaker](./docs/architecture/adr-0016-circuit-breaker.md) | Data Layer | Accepted |

---

## 🧠 Anti-Hallucination: The Citation Validator

The single most differentiated feature of Nova Invest. Every numeric value in
an AI-generated answer goes through a **3-stage validation pipeline**:

![Citation Validator Pipeline](./docs/assets/citation-pipeline.svg)

| Stage | Check | Failure Behavior |
|-------|-------|------------------|
| **1. Structural** | URL parses, HTTPS, hostname in allowlist, source label valid, confidence ∈ [0,1], value finite, unit non-empty | Strip fact, record `structural` failure |
| **2. Quote Substring** | `fact.source.quote` appears as exact substring (case-sensitive, whitespace-normalized) in RAG context | Strip fact, record `quote_substring` failure |
| **3. URL Reachability** | (Async, Cloud-only) HTTP GET with `redirect:"manual"` SSRF defence | Log to `url_check_queue` table; response NOT blocked |

**Failure modes**:
- ✅ **all_verified** — all facts pass Stages 1+2, response unchanged
- ⚠️ **partial_strip** — some facts fail, kept verified ones + append disclaimer
- 🚫 **strict_reject** — all facts fail, replace summary with
  *"I don't have reliable data for this question."*

📖 **Full spec**: [ADR-0007](./docs/architecture/adr-0007-citation-validator.md)

---

## 📊 Project Structure

```
nova-invest/
├── docs/                    # 📚 All project documentation
│   ├── architecture/        # 16 ADRs + architecture review history
│   ├── prd/                 # Master PRD + 8 Epic specs + appendices
│   ├── roadmap/             # 3-phase roadmap (0-18 months)
│   ├── spec/                # API spec, data model, DSL spec
│   └── reviews/             # Code/security review reports
├── web/                     # 🚀 Next.js 16 application
│   ├── src/
│   │   ├── app/             # Next.js App Router (9 routes + 6 API endpoints)
│   │   ├── components/      # React components (Header, Sidebar, 7 widgets)
│   │   └── lib/             # Business logic (16 modules)
│   │       ├── agent/       # ADR-0004 Agent Loop
│   │       ├── ask/         # ADR-0007 Stage 2 Citation Validator
│   │       ├── backtest/    # ADR-0009 Backtest Engine
│   │       ├── citation/    # ADR-0007 Stage 1 + Stage 3
│   │       ├── community/   # ADR-0012 Community UGC
│   │       ├── dashboard/   # ADR-0010 Dashboard Layout
│   │       ├── data/        # ADR-0002 + ADR-0016 Data Layer + Circuit Breaker
│   │       ├── db/          # ADR-0011 D1 Schema Master (25 tables)
│   │       ├── llm/         # ADR-0003 LLM Router
│   │       ├── memory/      # ADR-0005 Memory Layer (KV + D1)
│   │       ├── playbook/    # ADR-0013 Playbook System
│   │       ├── rag/         # ADR-0014 RAG Pipeline
│   │       ├── sse/         # ADR-0015 SSE Streaming
│   │       ├── strategy/    # ADR-0008 Strategy DSL
│   │       └── tools/       # ADR-0006 Tool Protocol
│   ├── public/mock/         # Mock JSON data (10 symbols, 5 QA samples)
│   └── migrations/          # D1 SQL migrations (001-009, 25 tables)
├── scripts/                 # Python mock data generator
└── project_memory.md        # 🧠 Session memory (auto-updated by agents)
```

---

## 📈 Roadmap

| Phase | Window | Theme | Exit Criteria |
|-------|--------|-------|---------------|
| **Phase 1: PMF Validation** | 0-6 mo | Validate product hypothesis, run minimal loop | 100 DAU + WAU-CW > 30 |
| **Phase 2: PMF Scaling** | 7-12 mo | Grow user base, validate business model | 5000 registered + 5% paid |
| **Phase 3: Platform** | 13-18 mo | Open ecosystem, multi-market expansion | 50K users + 5000+ UGC Playbooks |

📖 **Full roadmap**: [docs/roadmap/Roadmap.md](./docs/roadmap/Roadmap.md)

---

## 🔒 Security

Nova Invest takes security seriously. Key measures:

- **SSRF Defence (CWE-918)**: All outbound HTTP calls (citation URL reachability)
  use `redirect: "manual"` + `opaqueredirect` detection. No open-redirect
  pivoting to internal addresses.
- **SQL Injection Closure**: D1 table names are hardcoded `as const` literals,
  never interpolated from caller input.
- **Boundary Validation**: `validateMemoryRef()` runs at the top of every
  `MemoryStore.save()` call to reject malformed refs before they reach storage.
- **Fail-Fast Production Wiring**: `getMemoryStore()` throws when
  `USE_MOCK='false'` but `env.DB` is missing — no silent Mock fallback in
  production.
- **Source Allowlist**: Citation URLs must have hostnames in
  `{sec.gov, finance.yahoo.com, alphavantage.co, bloomberg.com, reuters.com}`.

📖 **Security review**: [docs/reviews/security-review-2026-07-20.md](./docs/reviews/security-review-2026-07-20.md)

---

## 📚 Documentation Index

| Document | Path | Description |
|----------|------|-------------|
| 📋 **Master PRD** | [docs/prd/Master_PRD.md](./docs/prd/Master_PRD.md) | Product requirements (8 Epics) |
| 🏗️ **Architecture** | [docs/architecture/](./docs/architecture/) | 16 ADRs + architecture reviews |
| 🗺️ **Roadmap** | [docs/roadmap/Roadmap.md](./docs/roadmap/Roadmap.md) | 3-phase 18-month plan |
| 🔌 **API Spec** | [docs/spec/api_spec.md](./docs/spec/api_spec.md) | REST + SSE API contracts |
| 📊 **Data Model** | [docs/spec/data_model.md](./docs/spec/data_model.md) | D1 schema + R2 layout |
| ⚖️ **Strategy DSL** | [docs/spec/strategy_dsl_spec.md](./docs/spec/strategy_dsl_spec.md) | YAML DSL grammar |
| 🔒 **Security Review** | [docs/reviews/security-review-2026-07-20.md](./docs/reviews/security-review-2026-07-20.md) | 2026-07-20 audit |
| 🌐 **中文 README** | [README.zh-CN.md](./README.zh-CN.md) | 中文项目说明 |

---

## 🤝 Contributing

Contributions are welcome! Please read:

1. [Master PRD](./docs/prd/Master_PRD.md) — understand the product vision
2. [Architecture](./docs/architecture/architecture.md) — understand the system
3. Run `pnpm test` before submitting PR — all tests must pass

### Code Style

- **TypeScript** strict mode (0 `any`, 0 `unknown` casts in business logic)
- **ESLint** + **Prettier** enforced
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- **ADR-first**: any architectural change MUST come with an ADR update

---

## 📄 License

[MIT](./LICENSE) © 2026 ZedeX

---

## 🙏 Acknowledgements

Nova Invest is a portfolio project demonstrating AI-native full-stack
engineering. It is **not** affiliated with Bloomberg, Reuters, or any
financial data provider. All mock data is synthetically generated for
educational purposes.

Built with ❤️ using:

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
