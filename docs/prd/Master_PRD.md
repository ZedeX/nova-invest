# Nova Invest · Master PRD

> **Version**: v1.0
>
> **Date**: 2026-07-19
>
> **Author**: ZedeX

***

## 0. Document Notes

### 0.1 Nature Tag System

Each section is tagged with its source:

- **\[A]** Descriptive: analyzing competitors' existing products (based on public materials)
- **\[B]** Normative: planning the next product iteration
- **\[C]** Personal project type: "As a personal learning project, I would define the system this way"

### 0.2 Document Structure

This Master PRD is the master outline of a **top-down structure**. The 8 Epic modules each have independent to-spec documents located under `docs/prd/epic/`.

### 0.3 Related Documents

- Architecture baseline: [architecture/architecture.md](../architecture/architecture.md)
- Detailed Roadmap: [roadmap/Roadmap.md](../roadmap/Roadmap.md)
- Technical specs: [spec/](../spec/)
- Appendix: [prd/appendix/](./appendix/)

***

## 1. Executive Summary \[C]

### 1.1 Product Definition

**Nova Invest** is an AI-native complete investment research workflow system: "information → judgment → strategy → monitoring".

### 1.2 One-sentence Positioning

> "Reconstruct the investment research workflow with an Agent Harness, turning natural language into verifiable trading strategies."

### 1.3 Three Core Capabilities

| # | Capability                          | Entry              | Frequency   |
| - | --------------------------- | --------------- | ---- |
| 1 | **Ask** deep research                | Natural language question          | One-time  |
| 2 | **Build Strategy** NL→strategy→backtest | Natural language description + DSL editing | Periodic iteration |
| 3 | **Build Dashboard** monitoring dashboard    | Selected strategy + signal configuration     | Long-term monitoring |

### 1.4 Three-phase Strategic Themes

| Phase      | Time      | Theme             | Exit Criteria                 |
| ------- | ------- | -------------- | -------------------- |
| Phase 1 | 0-6 months   | PMF Validation | D30 ≥ 20%, 200 WAU-CW |
| Phase 2 | 7-12 months  | PMF Scaling    | 5K MAU, 5% paid         |
| Phase 3 | 13-18 months | Platform-ization     | 500+ creators, ARR $1M+    |

***

## 2. Problem Statement \[A+B]

### 2.1 User Pain Points

1. **Information overload**: Too much news, earnings reports, research reports, X/Reddit — hard to judge what matters
2. **No systematic decision-making**: Relying on "gut feeling", no backtest verification, no hypothesis decomposition
3. **High backtest barrier**: Requires programming + data + engine — retail investors can't do it independently
4. **Lack of monitoring**: No one watches strategies after they go live, no alerts on drift
5. **Steep learning curve**: Large gap from subjective to quantitative
6. **Lack of trust**: Fear of "fake backtests", Agent hallucinations, strategy overfitting

### 2.2 Shortcomings of Existing Solutions

| Solution                     | Shortcoming                      |
| ---------------------- | ----------------------- |
| Bloomberg Terminal AI  | $24K+/year, unaffordable for retail           |
| Composer.trade         | No NL entry, visual drag-and-drop barrier still high       |
| QuantConnect           | Requires programming, pure quantitative, lacks fundamentals            |
| TradingView PineScript | DSL learning cost, no Agent, no natural language  |
| Competitor reference             | Still missing: backtest rigor disclosure, failure detection, Mock mode |

***

## 3. Solution \[C]

### 3.1 Core Philosophy

**"AI Native ≠ AI slapped onto traditional tools, but reconstructing the workflow from the Agent level"**

### 3.2 Redefining Vibe Trading

> "Vibe Trading is not simply 'NL → strategy', but 'NL → verifiable strategy + proactive risk disclosure'. Let users feel the strategy, but the strategy itself must go through rigorous validation."

### 3.3 Three Pillars

| Pillar                        | Slogan                            | Meaning            |
| ------------------------- | ----------------------------- | ------------- |
| **Vibe Trading**          | "Talk Is Cheap — Backtest It" | NL→strategy→backtest, within minutes |
| **Conviction Quantified** | "Conviction Quantified"       | Vague judgments decomposed into verifiable hypotheses  |
| **Beyond the Candles**    | "Beyond the Candles"          | Multi-dimensional data beyond price     |

### 3.4 Core Differentiating Features \[C]

1. **Backtest honesty**: Default display of Deflated Sharpe + multiple testing + overfitting warnings
2. **Mock/Real dual mode**: Mock for dev/demo, one-click switch to real API in production
3. **Failure detection alerts**: Auto notification when rolling Sharpe drops after strategy goes live
4. **Cloudflare free stack**: Globally deployable + demo, zero infrastructure cost
5. **Open Source**: Core code + PRD fully public, as a learning project

***

## 4. Target Users \[B+C]

### 4.1 Three Personas

#### Persona 1: Retail investor Alex

- 35 years old, software engineer, 3 years of part-time stock trading
- Position $50K-$200K
- Pain points: Information overload, no systematic decision-making
- Needs: Simple Q&A + signal alerts
- Willingness to pay: $10-30/month

#### Persona 2: Prosumer Brenda ✅ Primary

- 32 years old, financial industry professional, 5 years of part-time quantitative trading
- Position $200K-$1M
- Pain points: High backtest barrier, strategies hard to reproduce
- Needs: NL→strategy + rigorous backtest + Dashboard
- Willingness to pay: $50-200/month

#### Persona 3: Semi-professional Charles

- 40 years old, family office researcher
- Manages family assets $1M-$10M
- Pain points: Needs auditable decision-making process
- Needs: Complete workflow + reports + compliance
- Willingness to pay: $500-2000/month (B2B)

### 4.2 Priority

| Phase   | Primary Persona                    |
| ------- | ----------------------------- |
| Phase 1 | Brenda (Prosumer)             |
| Phase 2 | Brenda + Alex                 |
| Phase 3 | Brenda + Alex + Charles (B2B) |

***

## 5. Product Positioning \[B]

### 5.1 Geographic Strategy: US → China

- **Phase 1-2**: US market (clear compliance, large TAM, English documentation)
- **Phase 3**: China market (team HQ in Shanghai, but needs to handle FX/compliance)

### 5.2 Asset Strategy: US equities only

- **Phase 1-2**: US equities only (individual stocks, ETFs; options added in Phase 2)
- **Phase 3**: Expand to HK/China A-shares (compliance sensitive)

### 5.3 Commercialization Strategy: Free first → Paid later → Freemium

| Phase     | Model              |
| --------- | --------------- |
| Phase 1   | All Free (validate PMF)  |
| Phase 2 end | Introduce Pro/Pro+ paid tiers |
| Phase 3   | Freemium with strict limits   |

***

## 6. Business Model \[B]

### 6.1 Credit Billing System

See [appendix/billing\_credit\_system.md](./appendix/billing_credit_system.md).

| Operation           | Credit consumption |
| ------------ | --------- |
| Simple Ask (one sentence)  | 1-5       |
| Deep research (multi-step RAG) | 20-50     |
| Strategy construction (NL→DSL) | 30-80     |
| Backtest (by bar count) | 50-200    |
| Dashboard creation | 20-50     |
| Monitoring alert triggered       | 5/time       |

### 6.2 Plan Tiers

| Plan         | Price    | Credit/month | Features                           |
| ---------- | ----- | -------- | ---------------------------- |
| Free       | $0    | 500      | Ask + basic data + 1 strategy            |
| Pro        | $29/month | 2,000    | + Build + standard backtest + 5 Dashboards |
| Pro+       | $99/month | 10,000   | + premium data + multi-strategy + alerts            |
| Enterprise | Custom    | Custom       | + API + private deployment + reports            |

***

## 7. Regulatory Positioning \[B]

### 7.1 Positioning: Tech Platform (SaaS) + Publisher

- **Not doing** RIA (Registered Investment Adviser)
- **Not doing** Broker-Dealer
- **Not holding** user funds or securities
- **Not doing** personalized investment advice
- **May expand later** to RIA (Phase 3+, if B2B institutional clients require it)

### 7.2 Key Compliance Requirements

See [appendix/compliance\_legal.md](./appendix/compliance_legal.md).

| Regulation                      | Applicable                 | Key constraint           |
| ----------------------- | ------------------ | -------------- |
| Reg BI                  | Broker-Dealer      | Not applicable (Nova does not hold funds) |
| Investment Advisers Act | RIA                | Not applicable (non-personalized advice)    |
| Reg T                   | Margin             | Not applicable (no margin)     |
| PDT Rule                | Pattern Day Trader | Inform users, not enforced       |
| Rule 10b-5              | Insider information               | Strict disclaimer + data source review   |
| Reg FD                  | Fair disclosure               | Use only public data         |

### 7.3 Disclaimer

All AI outputs must include:

> "This content is for informational purposes only and does not constitute investment advice. AI outputs may contain errors; users should verify independently and bear investment risk."

***

## 8. North Star & KPI System \[C]

### 8.1 North Star Metric

> **WAU-CW (Weekly Active Users - Complete Workflow)**
>
> Definition: Number of active users who completed the three steps "Ask → Build → Dashboard" at least once in a week.

### 8.2 Complete KPI Tree (3 layers)

```
                  North Star: WAU-CW
                       |
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   Activation     Retention     Monetization
        |              |              |
   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
   ↓         ↓   ↓         ↓   ↓         ↓
Signup   First-Ask D1/D7/D30 WAU/MAU Free→Pro Pro→Pro+
   ↓         ↓   ↓         ↓   ↓         ↓
Activation  Build Feature  Cohort Trial    Upsell
  rate    success  usage   retention  conv.   rate
```

### 8.3 Metric Categories

| Category               | Primary metric                 | Secondary tracking                      |
| ---------------- | -------------------- | ------------------------- |
| **Activation**   | Signup→First Ask conversion rate | Steps of registration funnel                    |
| **Engagement**   | Avg Ask/Build count per capita      | Tool call count, query length           |
| **Retention**    | D1/D7/D30 retention         | Weekly return, monthly return                   |
| **Monetization** | Paid conversion rate, ARPU           | Trial→Pro conversion, Pro→Pro+ upgrade  |
| **Quality**      | Hallucination rate, latency, cost per query    | Tool failure rate, Hallucination detection |
| **Community**    | Creator count, Playbook shares    | Fork count, reproduction rate                |

See [appendix/billing\_credit\_system.md](./appendix/billing_credit_system.md) §3.

***

## 9. 8 Module Overview \[B+C]

> Each module has an independent Epic document, see `docs/prd/epic/`

### 9.1 Module Dependency Graph

```
1. Agent Harness (foundation)
       ↑
2. Data Layer (cross-cutting)
       ↑
3. Ask Agent ─── 4. Strategy DSL ─── 5. Dashboard
                                       ↑
6. Broker Integration ──────────────────┘
                                       ↑
7. Share & Community ─── 8. Playbook System
```

### 9.2 Module Quick Reference

| # | Module                 | Core responsibility                              | Phase | Detailed doc                                                          |
| - | ------------------ | --------------------------------- | ----- | ------------------------------------------------------------- |
| 1 | Agent Harness      | LLM scaffolding: loop+tools+memory+context | 1     | [01\_AgentHarness.md](./epic/01_AgentHarness.md)              |
| 2 | Data Layer         | Data source+Mock+cache                       | 1     | [02\_DataLayer.md](./epic/02_DataLayer.md)                    |
| 3 | Ask Agent          | Deep research Q&A                            | 1     | [03\_Ask\_Agent.md](./epic/03_Ask_Agent.md)                   |
| 4 | Strategy DSL       | NL→DSL→backtest                         | 1     | [04\_Strategy\_DSL.md](./epic/04_Strategy_DSL.md)             |
| 5 | Dashboard          | Monitoring dashboard                              | 1     | [05\_Dashboard.md](./epic/05_Dashboard.md)                    |
| 6 | Broker Integration | Live trading integration                              | 2     | [06\_Broker\_Integration.md](./epic/06_Broker_Integration.md) |
| 7 | Share & Community  | UGC + reproduction                          | 2     | [07\_Share\_Community.md](./epic/07_Share_Community.md)       |
| 8 | Playbook System    | Composable distribution                             | 3     | [08\_Playbook\_System.md](./epic/08_Playbook_System.md)       |

***

## 10. Roadmap Summary \[B+C]

> Detailed version at [roadmap/Roadmap.md](../roadmap/Roadmap.md)

### 10.1 Three-phase Panorama

```
2026 Q3 ─────────── 2027 Q2 ─────────── 2027 Q4
    Phase 1            Phase 2            Phase 3
    PMF Validation     PMF Scaling        Platform-ization

  · Mock closed loop           · Real API           · Playbook SDK
  · Agent Harness       · Broker live trading        · B2B SaaS
  · NL→DSL             · Pro/Pro+ plans     · API public
  · 200 WAU-CW        · 5K MAU             · 500 creators
                       · 3% paid            · ARR $1M+
```

### 10.2 Key Milestones

| Time  | Milestone                              |
| --- | -------------------------------- |
| M2  | Agent Harness v1 + full Mock suite       |
| M3  | Ask Agent launch + 10 templates             |
| M4  | NL→DSL public beta + Dashboard closed loop         |
| M6  | Phase 1 exit review (target 200 WAU-CW) |
| M7  | Real LLM API integration + Paper Trading    |
| M9  | Live trading gradual rollout + Pro plan                    |
| M12 | Phase 2 exit (target 5K MAU)            |
| M15 | Playbook SDK + Marketplace       |
| M18 | Phase 3 exit (target ARR $1M+)          |

***

## 11. Non-Goals — Phase 1 Explicit Exclusions \[B]

The following features are explicitly **not done** in Phase 1 to avoid dispersing effort:

| # | Non-goal              | Reason                   |
| - | ---------------- | -------------------- |
| 1 | Live trading (Paper only)    | High compliance risk, needs Phase 2 gradual rollout   |
| 2 | Native mobile App         | Limited resources, PWA first           |
| 3 | HK/China A-share market         | US equities focus only                |
| 4 | Institutional / B2B         | Validate B2C PMF first          |
| 5 | Self-trained LLM        | Use off-the-shelf models + RAG          |
| 6 | Self-built broker-dealer | Connect via partner broker |
| 7 | Options / derivatives         | High complexity                 |
| 8 | Internationalization (English version)         | Defer to Phase 2 end          |
| 9 | Public API           | Phase 3 platformization          |

***

## 12. Anti-Patterns Checklist \[C]

> Explicit checklist of "don't do X", useful for the engineering team and future PMs

### 12.1 Product Anti-Patterns

1. ❌ **Do not** let the LLM directly generate and execute Python code (security + non-auditable)
2. ❌ **Do not** show only Sharpe without revealing overfitting risk
3. ❌ **Do not** let backtests ignore trading costs by default
4. ❌ **Do not** provide personalized investment advice (compliance red line)
5. ❌ **Do not** hold user funds or securities

### 12.2 Technical Anti-Patterns

1. ❌ **Do not** run an Agent loop without max\_steps (loss-of-control risk)
2. ❌ **Do not** run LLM outputs without a cost ceiling (loss risk)
3. ❌ **Do not** launch an Agent without an eval golden set
4. ❌ **Do not** hard-code API keys (must use wrangler secret)
5. ❌ **Do not** store large objects in D1 (use R2)

### 12.3 Process Anti-Patterns

1. ❌ **Do not** prioritize without user interviews
2. ❌ **Do not** make major UI changes without A/B testing
3. ❌ **Do not** let the PRD diverge from the code (PRD changed but code not)

***

## 13. Deployment Architecture Summary \[C]

### 13.1 Cloudflare Free Stack

| Service                   | Use             | Free quota          |
| -------------------- | -------------- | ------------- |
| Cloudflare Pages     | Next.js hosting     | 500 builds/month  |
| Cloudflare Workers   | API routing + Agent | 100K req/day    |
| Cloudflare D1        | SQLite database     | 5GB + 5M row reads/day |
| Cloudflare R2        | K-line cache          | 10GB          |
| Cloudflare Vectorize | Vector retrieval (RAG)      | 30M queries/month      |
| Grafana Cloud        | Monitoring             | 10K series free |

See [appendix/deployment\_cloudflare.md](./appendix/deployment_cloudflare.md).

### 13.2 Mock / Real Mode

```bash
# Local development
USE_MOCK=true  # read mock_data/

# Cloudflare deployment (demo version)
USE_MOCK=true  # still use Mock, but deployed to Cloudflare

# Production mode (Phase 2+)
USE_MOCK=false  # real API
LLM_BASE_URL=https://ark.cn-beijing.volces.com
LLM_API_KEY=${{ARK_API_KEY}}
```

***

## 14. Risk Register

| #  | Risk                | Probability | Impact | Mitigation                             |
| -- | ----------------- | -- | -- | ------------------------------ |
| 1  | Agent hallucination causes user loss     | High  | Very high | Eval + tool schema + legal disclaimer        |
| 2  | Backtest engine bug          | Medium  | Very high | Unit tests + quantitative expert audit              |
| 3  | Live trading failure            | Medium  | Very high | Gradual rollout + limits + 7×24 oncall          |
| 4  | Compliance classified as investment advisory          | Medium  | High  | Legal + Publisher positioning              |
| 5  | LLM cost out of control          | High  | Medium  | Routing + cache + degradation                |
| 6  | Data vendor outage           | Medium  | Medium  | Multi-source + consensus                 |
| 7  | Cloudflare free quota exceeded | Low  | Medium  | Monitoring + auto fallback to Mock                |
| 8  | Founder roadmap conflict    | Medium  | Medium  | 1:1 + data-driven decision                   |
| 9  | Competitor first-mover              | High  | Medium  | Speed + differentiation (Mock mode + Cloudflare) |
| 10 | Loss of key talent            | Medium  | High  | Equity + culture                        |

***

## 15. Team & Collaboration

### 15.1 Roles and Collaboration Matrix

| Role    | Collaboration frequency     | Collaboration content                     |
| ----- | -------- | ------------------------ |
| CEO   | Weekly 1:1   | Strategic alignment + fundraising narrative              |
| CTO   | Weekly ≥ 2 | Technical feasibility + Agent Harness design |
| Engineering lead  | Daily       | sprint + detailed requirements            |
| Algorithms/ML | Weekly 2   | Model evaluation + RAG strategy + eval     |
| Design/UX | Weekly 2-3 | Prototypes + user testing                |
| Operations/Community | Weekly 1   | Community feedback + content creation              |
| Legal/Compliance | Monthly 1   | Regulatory + user agreements                |
| Investors   | Quarterly 1   | Progress reports + fundraising narrative              |

### 15.2 Weekly Rhythm

| Time   | Activity                          |
| ---- | --------------------------- |
| Monday morning | Engineering standup + this week's priorities                |
| Monday afternoon | User interviews ≥ 2                  |
| Tuesday   | Deep product usage + data analysis               |
| Wednesday   | Design/prototype + cross-team alignment               |
| Thursday   | Engineering detailed requirements + tool call log review      |
| Friday morning | Sprint demo + retrospective |
| Friday afternoon | Learning + Roadmap thinking             |

***

## 16. 90-Day Onboarding Plan \[C]

### Day 0-30: Learn

- 1:1 with everyone (10-15 people) + read all docs/slides/code
- Use the product deeply for ≥ 30h + record all friction
- User interviews ≥ 10 people
- Competitor deep comparison matrix

### Day 31-60: Diagnose

- Data analysis: funnel, retention, tool call logs
- Agent evaluation: run 50+ queries, tally accuracy/latency/cost
- Propose 90-day improvement Roadmap
- Pick 1-2 P0 friction points, design solutions

### Day 61-90: Do

- Work with engineering to launch v1 improvements
- Validate improvement effects with data
- Quarterly product review + Q+1 Roadmap
- First product share to the community

***

## 17. Appendix References

| Appendix            | File                                                                |
| ------------- | ----------------------------------------------------------------- |
| Billing rules          | [billing\_credit\_system.md](./appendix/billing_credit_system.md) |
| Compliance/legal          | [compliance\_legal.md](./appendix/compliance_legal.md)            |
| Cloudflare deployment | [deployment\_cloudflare.md](./appendix/deployment_cloudflare.md)  |
| Glossary           | [glossary.md](./appendix/glossary.md)                             |
| Data model          | [spec/data\_model.md](../spec/data_model.md)                      |
| DSL spec        | [spec/strategy\_dsl\_spec.md](../spec/strategy_dsl_spec.md)       |
| Architecture            | [architecture/architecture.md](../architecture/architecture.md)   |
| Roadmap       | [roadmap/Roadmap.md](../roadmap/Roadmap.md)                       |

***

## 18. Version History

| Version   | Date         | Change      |
| ---- | ---------- | ------- |
| v1.0 | 2026-07-19 | Initial version, job-search portfolio |

***

> Last updated: 2026-07-19 · Author: Xun Zhao + AI collaboration
