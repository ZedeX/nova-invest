# Glossary

> **Purpose**: Unify terminology across all Nova Invest PRD/Epic/Spec documents to avoid ambiguity.
> **Maintenance Rules**: New terms must be added to this document; deprecated terms retained and marked `[DEPRECATED]`.

---

## A. Product and Roles

| Term | Definition |
|---|---|
| **Nova Invest** | This project codename, AI-native investment research workflow system, personal learning project |
| **Competitor** | AI investment research products in the market, as reference objects |
| **Prosumer** | Producer + Consumer, professional consumer; in this document refers to "professional retail investor" |
| **Persona** | User persona, Nova Invest defines 3 types: Retail / Prosumer / Semi-professional |
| **PM** | Product Manager |
| **CPO** | Chief Product Officer |

## B. AI Agent Related

| Term | Definition |
|---|---|
| **Agent Harness** | Scaffolding around LLM: loop + tools + memory + context + guardrails |
| **LLM** | Large Language Model |
| **MCP** | Model Context Protocol, open tool-calling protocol launched by Anthropic in 2024.11 |
| **Function Calling** | LLM capability to output structured JSON to invoke tools |
| **RAG** | Retrieval-Augmented Generation |
| **ReAct** | Reason + Act, loop pattern where LLM reasons while calling tools |
| **Supervisor-Worker** | Multi-agent orchestration pattern: Supervisor routes + Worker executes |
| **Hand-off** | Task handoff protocol between Agents |
| **Eval** | Evaluation, includes Golden Set + LLM-as-judge |
| **Golden Set** | Human-annotated standard answer set, used to evaluate Agent accuracy |
| **Hallucination** | LLM fabricates non-existent facts |
| **Compaction** | Compress long conversation history into short summaries |
| **Tool Registry** | Tool registry, unified management of all callable tools |
| **Token Budget** | Token limit per query, for cost control |
| **Cost Ceiling** | Cost cap per query, triggers automatic model degradation |

## C. Finance and Trading

| Term | Definition |
|---|---|
| **OHLCV** | Open/High/Low/Close/Volume K-line data |
| **NBBO** | National Best Bid and Offer |
| **PDT** | Pattern Day Trader, accounts < $25K restricted |
| **RIA** | Registered Investment Adviser |
| **Broker-Dealer** | Broker-dealer, requires FINRA registration |
| **Publisher** | Information publisher, First Amendment protected, not investment adviser |
| **Paper Trading** | Simulated trading, no real money involved |
| **Backtest** | Test strategies using historical data |
| **Sharpe Ratio** | (R-Rf)/σ excess return per unit of total risk |
| **Sortino Ratio** | Sharpe variant that only penalizes downside volatility |
| **Max Drawdown (MDD)** | Maximum drawdown |
| **Deflated Sharpe** | Sharpe corrected for multiple testing |
| **Factor** | Statistical measure that explains stock returns |
| **Fama-French 3** | Market + Size + Value three-factor model |
| **Momentum** | Momentum factor, past 12-1 month returns |
| **Mean Reversion** | Mean reversion strategy |
| **Pairs Trading** | Pairs trading, statistical arbitrage |
| **VWAP** | Volume-Weighted Average Price |
| **Slippage** | Difference between backtest price and actual execution price |
| **Look-ahead bias** | Future function, using unavailable information at decision point |
| **Survivorship bias** | Survivorship bias, backtest only contains surviving stocks |
| **Walk-forward** | Rolling train-test analysis |
| **Purged K-Fold** | Time-series cross-validation, prevents information leakage |

## D. Technical Architecture

| Term | Definition |
|---|---|
| **Next.js** | React full-stack framework, Nova Invest frontend |
| **Cloudflare Workers** | Edge Serverless compute platform |
| **D1** | Cloudflare SQLite edge database |
| **R2** | Cloudflare object storage (S3 compatible) |
| **Vectorize** | Cloudflare vector database service |
| **Pages** | Cloudflare static site + SSR hosting |
| **Wrangler** | Cloudflare CLI tool |
| **lightweight-charts** | TradingView open-source charting library (Apache 2.0), integrated in Phase 1.5 |
| **LM Studio** | Local LLM runtime, OpenAI API compatible |
| **Ark** | Volcengine LLM API platform |
| **OpenTelemetry** | Open-source observability standard |
| **Grafana Cloud** | Visualization monitoring free tier |
| **DSL** | Domain-Specific Language |
| **YAML** | Human-readable data serialization format |
| **JSON Schema** | JSON structure definition standard |
| **State Machine** | State machine, describes object state transitions |
| **Test Seam** | Test seam, interface boundary for injecting Mocks |

## E. Product Metrics

| Term | Definition |
|---|---|
| **WAU** | Weekly Active Users |
| **WAU-CW** | WAU Complete Workflow, weekly active users who complete Ask→Build→Dashboard full workflow |
| **MAU** | Monthly Active Users |
| **D1/D7/D30** | 1/7/30-day retention after registration |
| **ARR** | Annual Recurring Revenue |
| **ARPU** | Average Revenue Per User |
| **Credit** | Nova Invest billing unit |
| **Conversion Rate** | Free-to-paid conversion rate |
| **NPS** | Net Promoter Score |
| **Funnel** | Funnel, registration→activation→retention→payment flow |
| **North Star** | North Star metric, Nova Invest chooses WAU-CW |

## F. Team and Process

| Term | Definition |
|---|---|
| **Epic** | Large requirement set, this document defines 8 Epics |
| **User Story** | User story, "As a... I want... so that..." |
| **Job Story** | "When... I want... so I can..." scenario-based requirement |
| **BDD** | Behavior-Driven Development Given/When/Then |
| **TDD** | Test-Driven Development |
| **ADR** | Architecture Decision Record |
| **OKR** | Objectives and Key Results |
| **PMF** | Product-Market Fit |
| **MVP** | Minimum Viable Product |
| **RFC** | Request for Comments, technical proposal |

## G. Module Names

| Abbreviation | Full Name |
|---|---|
| **AH** | Agent Harness |
| **DL** | Data Layer |
| **AA** | Ask Agent |
| **SD** | Strategy DSL |
| **DB** | Dashboard |
| **BI** | Broker Integration |
| **SC** | Share & Community |
| **PB** | Playbook System |

## H. Mock Mode Related

| Term | Definition |
|---|---|
| **USE_MOCK** | Environment variable, true=local Mock, false=real API |
| **Mock Provider** | Service implementation returning pre-made data |
| **Real Provider** | Service implementation calling real external APIs |
| **Seed Data** | D1 initialization preset data |
| **Mock K-line** | Locally pre-generated OHLCV JSON, for frontend loading without network |

> Last updated: 2026-07-19