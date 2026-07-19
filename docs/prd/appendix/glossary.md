# 术语表 (Glossary)

> **用途**: 统一 Nova Invest 全部 PRD/Epic/Spec 文档术语，避免歧义。
> **维护规则**: 新增术语必须更新本文档；废弃术语保留并标注 `[DEPRECATED]`。

---

## A. 产品与角色

| 术语 | 定义 |
|---|---|
| **Nova Invest** | 本项目代号，AI-native 投研工作流系统，Alva-inspired 求职作品 |
| **Alva** | 参考竞品（alva.xyz），由 Galxe spin-off 的 AI 投研产品 |
| **Prosumer** | Producer + Consumer，专业消费者；本文档指"专业散户" |
| **Persona** | 用户画像，Nova Invest 定义 3 类：散户 / Prosumer / 半专业 |
| **PM** | Product Manager 产品经理 |
| **CPO** | Chief Product Officer 首席产品官 |

## B. AI Agent 相关

| 术语 | 定义 |
|---|---|
| **Agent Harness** | LLM 周围的脚手架：loop + tools + memory + context + guardrails |
| **LLM** | Large Language Model 大语言模型 |
| **MCP** | Model Context Protocol，Anthropic 2024.11 推出的工具调用开放协议 |
| **Function Calling** | LLM 输出结构化 JSON 调用工具的能力 |
| **RAG** | Retrieval-Augmented Generation 检索增强生成 |
| **ReAct** | Reason + Act，LLM 边推理边调用工具的循环模式 |
| **Supervisor-Worker** | 多 Agent 编排模式：Supervisor 路由 + Worker 执行 |
| **Hand-off** | Agent 之间任务交接协议 |
| **Eval** | Evaluation 评估，含 Golden Set + LLM-as-judge |
| **Golden Set** | 人工标注的标准答案集，用于评估 Agent 准确率 |
| **Hallucination** | 幻觉，LLM 编造不存在的事实 |
| **Compaction** | 压缩，把长对话历史总结成短摘要 |
| **Tool Registry** | 工具注册表，统一管理所有可调用工具 |
| **Token Budget** | 单次 query 的 token 上限，用于成本控制 |
| **Cost Ceiling** | 单次 query 成本上限，触发自动降级 |

## C. 金融与交易

| 术语 | 定义 |
|---|---|
| **OHLCV** | Open/High/Low/Close/Volume K 线数据 |
| **NBBO** | National Best Bid and Offer 全美最优报价 |
| **PDT** | Pattern Day Trader 模式日内交易者，账户 < $25K 受限 |
| **RIA** | Registered Investment Adviser 注册投资顾问 |
| **Broker-Dealer** | 经纪交易商，需 FINRA 注册 |
| **Publisher** | 信息发布者，First Amendment 保护，非投顾 |
| **Paper Trading** | 模拟交易，不涉及真实资金 |
| **Backtest** | 回测，用历史数据测试策略 |
| **Sharpe Ratio** | (R-Rf)/σ 单位总风险超额收益 |
| **Sortino Ratio** | 只对下行波动惩罚的 Sharpe 变体 |
| **Max Drawdown (MDD)** | 最大回撤 |
| **Deflated Sharpe** | 多重检验校正后的 Sharpe |
| **Factor** | 因子，能解释股票收益的统计量 |
| **Fama-French 3** | Market + Size + Value 三因子模型 |
| **Momentum** | 动量因子，过去 12-1 月收益 |
| **Mean Reversion** | 均值回复策略 |
| **Pairs Trading** | 配对交易，统计套利 |
| **VWAP** | Volume-Weighted Average Price 成交量加权均价 |
| **Slippage** | 滑点，回测价与实际成交价偏差 |
| **Look-ahead bias** | 未来函数，决策时点用了不可得的信息 |
| **Survivorship bias** | 幸存者偏差，回测只含存活股票 |
| **Walk-forward** | 滚动训练-测试分析 |
| **Purged K-Fold** | 时间序列交叉验证，防止信息泄漏 |

## D. 技术架构

| 术语 | 定义 |
|---|---|
| **Next.js** | React 全栈框架，Nova Invest 前端 |
| **Cloudflare Workers** | 边缘 Serverless 计算平台 |
| **D1** | Cloudflare SQLite 边缘数据库 |
| **R2** | Cloudflare 对象存储（S3 兼容） |
| **Vectorize** | Cloudflare 向量数据库服务 |
| **Pages** | Cloudflare 静态站 + SSR 托管 |
| **Wrangler** | Cloudflare CLI 工具 |
| **TradingView Charting Library** | 专业金融图表库，免费商用 |
| **LM Studio** | 本地 LLM 运行环境，兼容 OpenAI API |
| **Ark** | 火山引擎大模型 API 平台 |
| **OpenTelemetry** | 开源可观测性标准 |
| **Grafana Cloud** | 可视化监控免费层 |
| **DSL** | Domain-Specific Language 领域特定语言 |
| **YAML** | 人类可读的数据序列化格式 |
| **JSON Schema** | JSON 结构定义标准 |
| **State Machine** | 状态机，描述对象状态流转 |
| **Test Seam** | 测试缝，可注入 Mock 的接口边界 |

## E. 产品指标

| 术语 | 定义 |
|---|---|
| **WAU** | Weekly Active Users 周活 |
| **WAU-CW** | WAU Complete Workflow，完成 Ask→Build→Dashboard 全流程的周活 |
| **MAU** | Monthly Active Users 月活 |
| **D1/D7/D30** | 注册后 1/7/30 日留存 |
| **ARR** | Annual Recurring Revenue 年度经常性收入 |
| **ARPU** | Average Revenue Per User 每用户平均收入 |
| **Credit** | Nova Invest 计费单位 |
| **Conversion Rate** | 免费转付费转化率 |
| **NPS** | Net Promoter Score 净推荐值 |
| **Funnel** | 漏斗，注册→激活→留存→付费 流程 |
| **North Star** | 北极星指标，Nova Invest 选 WAU-CW |

## F. 团队与流程

| 术语 | 定义 |
|---|---|
| **Epic** | 大型需求集，本文档定义 8 个 Epic |
| **User Story** | 用户故事，"As a... I want... so that..." |
| **Job Story** | "When... I want... so I can..." 场景化需求 |
| **BDD** | Behavior-Driven Development 给定/当/那么 |
| **TDD** | Test-Driven Development 测试驱动开发 |
| **ADR** | Architecture Decision Record 架构决策记录 |
| **OKR** | Objectives and Key Results 目标与关键结果 |
| **PMF** | Product-Market Fit 产品市场契合 |
| **MVP** | Minimum Viable Product 最小可行产品 |
| **RFC** | Request for Comments 技术提案 |

## G. 模块名称

| 缩写 | 全称 |
|---|---|
| **AH** | Agent Harness |
| **DL** | Data Layer |
| **AA** | Ask Agent |
| **SD** | Strategy DSL |
| **DB** | Dashboard |
| **BI** | Broker Integration |
| **SC** | Share & Community |
| **PB** | Playbook System |

## H. Mock 模式相关

| 术语 | 定义 |
|---|---|
| **USE_MOCK** | 环境变量，true=本地 Mock，false=真实 API |
| **Mock Provider** | 返回预制数据的服务实现 |
| **Real Provider** | 调用真实外部 API 的服务实现 |
| **Seed Data** | D1 初始化预置数据 |
| **Mock K 线** | 本地预生成 OHLCV JSON，供前端无网络加载 |

> 末次更新：2026-07-19
