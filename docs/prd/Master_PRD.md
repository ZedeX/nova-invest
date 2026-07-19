# Nova Invest · Master PRD

> **版本**: v1.0
>
> **日期**: 2026-07-19
>
> **作者**: ZedeX

***

## 0. 文档说明

### 0.1 性质标签体系

每个章节标注来源：

- **\[A]** 描述性：反向工程 Alva 现有产品（基于公开资料）
- **\[B]** 规范性：规划 Alva v2 下一迭代
- **\[C]** 求职作品型："如果我是新任 PM，我会这样定义系统，做得比 Alva 更好"

### 0.2 文档结构

本 Master PRD 是**总分结构**的总纲。8 个 Epic 模块各自有独立的 to-spec 文档位于 `docs/prd/epic/` 下。

### 0.3 关联文档

- 架构基线：[architecture/architecture.md](../architecture/architecture.md)
- 详细 Roadmap：[roadmap/Roadmap.md](../roadmap/Roadmap.md)
- 技术规格：[spec/](../spec/)
- 附录：[prd/appendix/](./appendix/)

***

## 1. 执行摘要 (Executive Summary) \[C]

### 1.1 产品定义

**Nova Invest** 是 AI-native 的"信息 → 判断 → 策略 → 监控"完整投研工作流系统。

### 1.2 一句话定位

> "用 Agent Harness 重构投研工作流，让自然语言变成可验证的交易策略。"

### 1.3 三大核心能力

| # | 能力                          | 入口              | 频次   |
| - | --------------------------- | --------------- | ---- |
| 1 | **Ask** 深度研究                | 自然语言提问          | 一次性  |
| 2 | **Build Strategy** NL→策略→回测 | 自然语言描述 + DSL 编辑 | 周期迭代 |
| 3 | **Build Dashboard** 监控看板    | 选定策略 + 信号配置     | 长期监控 |

### 1.4 三阶段战略主题

| 阶段      | 时间      | 主题             | 退出标准                 |
| ------- | ------- | -------------- | -------------------- |
| Phase 1 | 0-6 月   | PMF Validation | D30 ≥ 20%，200 WAU-CW |
| Phase 2 | 7-12 月  | PMF Scaling    | 5K MAU，5% 付费         |
| Phase 3 | 13-18 月 | Platform 化     | 500+ 创作者，ARR $1M+    |

***

## 2. 问题陈述 (Problem Statement) \[A+B]

### 2.1 用户痛点

1. **信息过载**：新闻、财报、研报、X/Reddit 太多，难以判断哪些重要
2. **决策无系统**：靠"感觉"，无回测验证，无假设拆解
3. **回测门槛高**：需要编程 + 数据 + 引擎，散户无法独立完成
4. **监控缺失**：策略上线后无人盯，漂移无告警
5. **学习曲线陡**：从主观到量化跨度大
6. **信任缺失**：怕"假回测"、怕 Agent 幻觉、怕策略过拟合

### 2.2 现有方案的不足

| 方案                     | 不足                      |
| ---------------------- | ----------------------- |
| Bloomberg Terminal AI  | $24K+/年，零售不可达           |
| Composer.trade         | 无 NL 入口，可视化拖拽门槛仍高       |
| QuantConnect           | 需编程，纯量化，缺基本面            |
| TradingView PineScript | DSL 学习成本，无 Agent，无自然语言  |
| Alva（参考对象）             | 仍缺：回测严谨度披露、失效检测、Mock 模式 |

***

## 3. 解决方案 (Solution) \[C]

### 3.1 核心理念

**"AI Native ≠ AI 贴在传统工具上，而是从 Agent 重构工作流"**

### 3.2 Vibe Trading 重新定义

> "Vibe Trading 不是简单的 'NL → 策略'，而是 'NL → 可验证策略 + 主动风险揭示'。让用户感受策略，但策略本身必须经过 rigorous 验证。"

### 3.3 三大支柱

| 支柱                        | 口号                            | 含义            |
| ------------------------- | ----------------------------- | ------------- |
| **Vibe Trading**          | "Talk Is Cheap — Backtest It" | NL→策略→回测，几分钟内 |
| **Conviction Quantified** | "Conviction Quantified"       | 模糊判断拆解成可验证假设  |
| **Beyond the Candles**    | "Beyond the Candles"          | 价格之外的多维数据     |

### 3.4 比 Alva 做得更好的 5 个点 \[C]

1. **回测诚实度**：默认显示 Deflated Sharpe + 多重检验 + 过拟合警告
2. **Mock/真实双模**：开发/演示用 Mock，生产可一键切换真实 API
3. **失效检测告警**：策略上线后 rolling Sharpe 下降自动通知
4. **Cloudflare 免费栈**：可全球部署 + 演示，零基础设施成本
5. **Open Source**：核心代码 + PRD 全公开，作为求职作品

***

## 4. 目标用户 (Target Users) \[B+C]

### 4.1 三类 Persona

#### Persona 1: 散户 Alex

- 35 岁，软件工程师，业余炒股 3 年
- 持仓 $50K-$200K
- 痛点：信息过载，决策无系统
- 需求：简单问答 + 信号提醒
- 付费意愿：$10-30/月

#### Persona 2: Prosumer Brenda ✅ 主力

- 32 岁，金融行业从业者，业余量化 5 年
- 持仓 $200K-$1M
- 痛点：回测门槛高，策略难复现
- 需求：NL→策略 + 严格回测 + Dashboard
- 付费意愿：$50-200/月

#### Persona 3: 半专业 Charles

- 40 岁，家族办公室研究员
- 管理家族资产 $1M-$10M
- 痛点：需要可审计的决策过程
- 需求：完整工作流 + 报告 + 合规
- 付费意愿：$500-2000/月（B2B）

### 4.2 优先级

| Phase   | 主力 Persona                    |
| ------- | ----------------------------- |
| Phase 1 | Brenda (Prosumer)             |
| Phase 2 | Brenda + Alex                 |
| Phase 3 | Brenda + Alex + Charles (B2B) |

***

## 5. 产品定位 (Product Positioning) \[B]

### 5.1 地理策略：美国 → 中国

- **Phase 1-2**：美国市场（合规清晰、TAM 大、英文文档）
- **Phase 3**：中国市场（团队本部上海，但需处理外汇/合规）

### 5.2 资产策略：仅美股

- **Phase 1-2**：仅美股（个股、ETF、期权 Phase 2 加）
- **Phase 3**：扩展港股/A 股（合规敏感）

### 5.3 商业化策略：先 Free → 后付费 → Freemium

| Phase     | 模式              |
| --------- | --------------- |
| Phase 1   | 全 Free（验证 PMF）  |
| Phase 2 末 | 引入 Pro/Pro+ 付费层 |
| Phase 3   | Freemium 严格限额   |

***

## 6. 商业化模型 (Business Model) \[B]

### 6.1 Credit 计费系统

详见 [appendix/billing\_credit\_system.md](./appendix/billing_credit_system.md)。

| 操作           | Credit 消耗 |
| ------------ | --------- |
| 简单 Ask（一句话）  | 1-5       |
| 深度研究（多步 RAG） | 20-50     |
| 策略构建（NL→DSL） | 30-80     |
| 回测（按 bar 数量） | 50-200    |
| Dashboard 创建 | 20-50     |
| 监控告警触发       | 5/次       |

### 6.2 套餐层级

| 套餐         | 价格    | Credit/月 | 功能                           |
| ---------- | ----- | -------- | ---------------------------- |
| Free       | $0    | 500      | Ask + 基础数据 + 1 策略            |
| Pro        | $29/月 | 2,000    | + Build + 标准回测 + 5 Dashboard |
| Pro+       | $99/月 | 10,000   | + 高级数据 + 多策略 + 告警            |
| Enterprise | 定制    | 定制       | + API + 私有部署 + 报告            |

***

## 7. 监管定位 (Regulatory Positioning) \[B]

### 7.1 定位：Tech Platform (SaaS) + Publisher

- **不做** RIA（注册投资顾问）
- **不做** Broker-Dealer
- **不持** 用户资金或证券
- **不做** 个性化投资建议
- **后期可扩展** RIA（Phase 3+，若需 B2B 机构客户）

### 7.2 关键合规要求

详见 [appendix/compliance\_legal.md](./appendix/compliance_legal.md)。

| 法规                      | 适用                 | 关键约束           |
| ----------------------- | ------------------ | -------------- |
| Reg BI                  | Broker-Dealer      | 不适用（Nova 不持资金） |
| Investment Advisers Act | RIA                | 不适用（非个性化建议）    |
| Reg T                   | Margin             | 不适用（不做保证金）     |
| PDT Rule                | Pattern Day Trader | 提示用户，不强制       |
| Rule 10b-5              | 内幕信息               | 严格免责 + 数据源审查   |
| Reg FD                  | 公平披露               | 仅用公开数据         |

### 7.3 免责声明

所有 AI 输出必须包含：

> "本内容仅为信息发布，不构成投资建议。AI 输出可能存在错误，用户应自行核实并承担投资风险。"

***

## 8. 北极星与指标体系 (North Star & KPI) \[C]

### 8.1 北极星指标

> **WAU-CW (Weekly Active Users - Complete Workflow)**
>
> 定义：一周内完成 "Ask → Build → Dashboard" 三步至少一次的活跃用户数。

### 8.2 完整 KPI 树（3 层）

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

### 8.3 指标分类

| 类别               | 一级指标                 | 二级埋点                      |
| ---------------- | -------------------- | ------------------------- |
| **Activation**   | Signup→First Ask 转化率 | 注册漏斗各步                    |
| **Engagement**   | 人均 Ask/Build 次数      | 工具调用次数、Query 长度           |
| **Retention**    | D1/D7/D30 留存         | 周回访、月回访                   |
| **Monetization** | 付费转化率、ARPU           | Trial→Pro 转化、Pro→Pro+ 升级  |
| **Quality**      | 幻觉率、延迟、单 query 成本    | Tool 失败率、Hallucination 检测 |
| **Community**    | 创作者数、Playbook 分享量    | Fork 数、复现率                |

详见 [appendix/billing\_credit\_system.md](./appendix/billing_credit_system.md) §3。

***

## 9. 8 大模块概览 (Module Overview) \[B+C]

> 每个模块有独立 Epic 文档，详见 `docs/prd/epic/`

### 9.1 模块依赖图

```
1. Agent Harness (地基)
       ↑
2. Data Layer (贯穿)
       ↑
3. Ask Agent ─── 4. Strategy DSL ─── 5. Dashboard
                                       ↑
6. Broker Integration ──────────────────┘
                                       ↑
7. Share & Community ─── 8. Playbook System
```

### 9.2 模块速览

| # | 模块                 | 核心职责                              | Phase | 详细文档                                                          |
| - | ------------------ | --------------------------------- | ----- | ------------------------------------------------------------- |
| 1 | Agent Harness      | LLM 脚手架：loop+tools+memory+context | 1     | [01\_AgentHarness.md](./epic/01_AgentHarness.md)              |
| 2 | Data Layer         | 数据源+Mock+缓存                       | 1     | [02\_DataLayer.md](./epic/02_DataLayer.md)                    |
| 3 | Ask Agent          | 深度研究问答                            | 1     | [03\_Ask\_Agent.md](./epic/03_Ask_Agent.md)                   |
| 4 | Strategy DSL       | NL→DSL→回测                         | 1     | [04\_Strategy\_DSL.md](./epic/04_Strategy_DSL.md)             |
| 5 | Dashboard          | 监控看板                              | 1     | [05\_Dashboard.md](./epic/05_Dashboard.md)                    |
| 6 | Broker Integration | 实盘接入                              | 2     | [06\_Broker\_Integration.md](./epic/06_Broker_Integration.md) |
| 7 | Share & Community  | UGC + 复现                          | 2     | [07\_Share\_Community.md](./epic/07_Share_Community.md)       |
| 8 | Playbook System    | 可组合分发                             | 3     | [08\_Playbook\_System.md](./epic/08_Playbook_System.md)       |

***

## 10. Roadmap 摘要 (Roadmap Summary) \[B+C]

> 详细版本见 [roadmap/Roadmap.md](../roadmap/Roadmap.md)

### 10.1 三阶段全景

```
2026 Q3 ─────────── 2027 Q2 ─────────── 2027 Q4
    Phase 1            Phase 2            Phase 3
    PMF Validation     PMF Scaling        Platform化

  · Mock 闭环           · 真实 API           · Playbook SDK
  · Agent Harness       · Broker 实盘        · B2B SaaS
  · NL→DSL             · Pro/Pro+ 套餐     · API 公开
  · 200 WAU-CW        · 5K MAU             · 500 创作者
                       · 3% 付费            · ARR $1M+
```

### 10.2 关键里程碑

| 时间  | 里程碑                              |
| --- | -------------------------------- |
| M2  | Agent Harness v1 + Mock 全套       |
| M3  | Ask Agent 上线 + 10 模板             |
| M4  | NL→DSL 公测 + Dashboard 闭环         |
| M6  | Phase 1 退出 review（目标 200 WAU-CW） |
| M7  | 真实 LLM API 接入 + Paper Trading    |
| M9  | 实盘灰度 + Pro 套餐                    |
| M12 | Phase 2 退出（目标 5K MAU）            |
| M15 | Playbook SDK + Marketplace       |
| M18 | Phase 3 退出（目标 ARR $1M+）          |

***

## 11. 非目标 (Non-Goals) — Phase 1 显式排除 \[B]

以下功能在 Phase 1 明确**不做**，避免分散精力：

| # | 非目标              | 原因                   |
| - | ---------------- | -------------------- |
| 1 | 实盘交易（仅 Paper）    | 合规风险高，需 Phase 2 灰度   |
| 2 | 移动原生 App         | 资源有限，先 PWA           |
| 3 | 港股/A 股市场         | 仅美股聚焦                |
| 4 | 机构 / B2B         | 先验证 B2C PMF          |
| 5 | 自研 LLM 训练        | 用现成模型 + RAG          |
| 6 | 自建 broker-dealer | 通过 partner broker 接入 |
| 7 | 期权 / 衍生品         | 复杂度高                 |
| 8 | 国际化（英文版）         | Phase 2 末再做          |
| 9 | API 公开           | Phase 3 平台化          |

***

## 12. 反模式清单 (Anti-Patterns) \[C]

> "不要做 X" 的明确清单，对工程团队和未来 PM 都有用

### 12.1 产品反模式

1. ❌ **不要**让 LLM 直接生成 Python 代码并执行（安全 + 不可审计）
2. ❌ **不要**只展示 Sharpe 而不揭示过拟合风险
3. ❌ **不要**让回测默认忽略交易成本
4. ❌ **不要**做个性化投资建议（合规红线）
5. ❌ **不要**持有用户资金或证券

### 12.2 技术反模式

1. ❌ **不要**在 Agent loop 中不设 max\_steps（失控风险）
2. ❌ **不要**在 LLM 输出上不设 cost ceiling（亏损风险）
3. ❌ **不要**在没有 eval golden set 的情况下上线 Agent
4. ❌ **不要**把 API key 写进代码（必须用 wrangler secret）
5. ❌ **不要**在 D1 中存大对象（用 R2）

### 12.3 流程反模式

1. ❌ **不要**在没有用户访谈的情况下排优先级
2. ❌ **不要**在没有 A/B test 的情况下大改 UI
3. ❌ **不要**让 PRD 与代码脱节（PRD 改了代码不改）

***

## 13. 部署架构摘要 (Deployment) \[C]

### 13.1 Cloudflare 免费栈

| 服务                   | 用途             | 免费额度          |
| -------------------- | -------------- | ------------- |
| Cloudflare Pages     | Next.js 托管     | 500 builds/月  |
| Cloudflare Workers   | API 路由 + Agent | 100K req/天    |
| Cloudflare D1        | SQLite 数据库     | 5GB + 5M 行读/天 |
| Cloudflare R2        | K 线缓存          | 10GB          |
| Cloudflare Vectorize | 向量检索（RAG）      | 30M 查询/月      |
| Grafana Cloud        | 监控             | 10K series 免费 |

详见 [appendix/deployment\_cloudflare.md](./appendix/deployment_cloudflare.md)。

### 13.2 Mock / 真实模式

```bash
# 本地开发
USE_MOCK=true  # 读取 mock_data/

# Cloudflare 部署（演示版）
USE_MOCK=true  # 仍用 Mock，但部署到 Cloudflare

# 生产模式（Phase 2+）
USE_MOCK=false  # 真实 API
LLM_BASE_URL=https://ark.cn-beijing.volces.com
LLM_API_KEY=${{ARK_API_KEY}}
```

***

## 14. 风险登记 (Risk Register)

| #  | 风险                | 概率 | 影响 | 缓解                             |
| -- | ----------------- | -- | -- | ------------------------------ |
| 1  | Agent 幻觉致用户损失     | 高  | 极高 | Eval + 工具 schema + 法务免责        |
| 2  | 回测引擎 bug          | 中  | 极高 | 单元测试 + 量化专家 audit              |
| 3  | 实盘交易故障            | 中  | 极高 | 灰度 + 限额 + 7×24 oncall          |
| 4  | 合规被定性为投顾          | 中  | 高  | 法务 + Publisher 定位              |
| 5  | LLM 成本失控          | 高  | 中  | 路由 + cache + 降级                |
| 6  | 数据供应商中断           | 中  | 中  | 多源 + consensus                 |
| 7  | Cloudflare 免费额度超限 | 低  | 中  | 监控 + 自动降级到 Mock                |
| 8  | 创始人 roadmap 冲突    | 中  | 中  | 1:1 + 数据驱动决策                   |
| 9  | 竞品先发              | 高  | 中  | 速度 + 差异化（Mock 模式 + Cloudflare） |
| 10 | 关键人才流失            | 中  | 高  | 期权 + 文化                        |

***

## 15. 团队与协作 (Team & Collaboration)

### 15.1 角色与协作矩阵

| 角色    | 协作频率     | 协作内容                     |
| ----- | -------- | ------------------------ |
| CEO   | 每周 1:1   | 战略对齐 + 融资叙事              |
| CTO   | 每周 ≥ 2 次 | 技术可行性 + Agent Harness 设计 |
| 工程主管  | 每日       | sprint + 详细需求            |
| 算法/ML | 每周 2 次   | 模型评测 + RAG 策略 + eval     |
| 设计/UX | 每周 2-3 次 | 原型 + 用户测试                |
| 运营/社区 | 每周 1 次   | 社区反馈 + 内容创作              |
| 法务/合规 | 每月 1 次   | 监管 + 用户协议                |
| 投资人   | 季度 1 次   | 进展汇报 + 融资叙事              |

### 15.2 周节奏

| 时间   | 活动                          |
| ---- | --------------------------- |
| 周一上午 | 工程站会 + 本周优先级                |
| 周一下午 | 用户访谈 ≥ 2 个                  |
| 周二   | 深度使用产品 + 数据分析               |
| 周三   | 设计/原型 + 跨团队对齐               |
| 周四   | 工程详细需求 + 工具调用日志 review      |
| 周五上午 | Sprint demo + retrospective |
| 周五下午 | 学习 + Roadmap 思考             |

***

## 16. 90 天入职计划 (90-Day Plan) \[C]

### Day 0-30：学

- 全员 1:1（10-15 人）+ 通读所有 docs/slides/code
- 深度使用产品 ≥ 30h + 记录所有摩擦
- 用户访谈 ≥ 10 人
- 竞品深度对比矩阵

### Day 31-60：诊断

- 数据分析：funnel、留存、工具调用日志
- Agent 评测：跑 50+ query，统计准确率/延迟/成本
- 提出 90 天改进 Roadmap
- 选 1-2 个 P0 摩擦，设计解决方案

### Day 61-90：做

- 与工程合作上线 v1 改进
- 数据验证改进效果
- 季度产品 review + Q+1 Roadmap
- 给社区做第一次产品分享

***

## 17. 附录引用

| 附录            | 文件                                                                |
| ------------- | ----------------------------------------------------------------- |
| 计费规则          | [billing\_credit\_system.md](./appendix/billing_credit_system.md) |
| 合规法律          | [compliance\_legal.md](./appendix/compliance_legal.md)            |
| Cloudflare 部署 | [deployment\_cloudflare.md](./appendix/deployment_cloudflare.md)  |
| 术语表           | [glossary.md](./appendix/glossary.md)                             |
| 数据模型          | [spec/data\_model.md](../spec/data_model.md)                      |
| DSL 规格        | [spec/strategy\_dsl\_spec.md](../spec/strategy_dsl_spec.md)       |
| 架构            | [architecture/architecture.md](../architecture/architecture.md)   |
| Roadmap       | [roadmap/Roadmap.md](../roadmap/Roadmap.md)                       |

***

## 18. 版本历史

| 版本   | 日期         | 变更      |
| ---- | ---------- | ------- |
| v1.0 | 2026-07-19 | 初版，求职作品 |

***

> 末次更新：2026-07-19 · 作者：赵勋 (Xun Zhao) + AI 协作

