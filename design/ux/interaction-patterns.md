# Interaction Pattern Library — Nova Invest

> **Status**: Active
> **Last Updated**: 2026-07-19
> **Template**: Interaction Pattern Library

---

## Overview

This catalog defines reusable interaction patterns for Nova Invest's UI. All patterns align with the accessibility requirements in `design/accessibility-requirements.md` (WCAG 2.1 AA).

**Input Methods**: Keyboard + Mouse (primary); Touch (Phase 2 responsive)
**Target Platforms**: Desktop web (primary); Mobile web (Phase 2)

---

## Pattern Catalog

| # | Pattern | Category | Used In |
|---|---------|----------|---------|
| 1 | Chat Conversation | Data Display | Ask Agent |
| 2 | Streaming Text Reveal | Feedback | Ask Agent, Build Agent |
| 3 | Citation Badge | Data Display | Ask Agent |
| 4 | Tool Result Card | Data Display | Ask Agent, Build Agent, Dashboard Agent |
| 5 | Financial Chart Viewer | Data Display | Ask Agent, Dashboard Agent |
| 6 | Strategy DSL Editor | Input | Build Agent |
| 7 | Backtest Result Panel | Data Display | Build Agent |
| 8 | Watchlist Manager | Navigation + Input | Dashboard Agent |
| 9 | Alert Notification | Feedback | Dashboard Agent |
| 10 | Agent Tab Switcher | Navigation | Global |
| 11 | Cost/Trace Status Bar | Feedback | Global |
| 12 | Mock/Real Mode Toggle | Input | Settings |

---

## Patterns

### 1. Chat Conversation

**Category**: Data Display
**Used In**: Ask Agent

**Description**: A conversational interface showing user questions and AI responses in chronological order. Supports text, citations, and embedded tool results.

**Specification**:
- Layout: Vertical scrollable message list, newest at bottom.
- User messages: Right-aligned, distinct background color.
- AI messages: Left-aligned, streaming text reveal pattern.
- Auto-scroll to latest message on new content.
- Scroll-up pauses auto-scroll; scroll-to-bottom resumes it.
- Keyboard: Tab through messages; Enter on message to expand/collapse details.
- ARIA: Container `role="log"` with `aria-live="polite"`.
- Accessibility: Messages are semantically structured with headings for each exchange.

**When to Use**: Any LLM-driven Q&A interface.
**When NOT to Use**: Static content display; use regular content blocks instead.

---

### 2. Streaming Text Reveal

**Category**: Feedback
**Used In**: Ask Agent, Build Agent

**Description**: Text appears incrementally (token by token) as the LLM generates it. Mimics real-time AI thinking.

**Specification**:
- Text appends character-by-character with ~30ms per token render interval.
- Cursor indicator (blinking caret) at end of streaming text.
- On stream complete: caret disappears, text becomes static.
- Keyboard: No interaction during streaming (read-only).
- ARIA: Parent container `aria-live="polite"` — screen readers announce on stream completion, not per-token.
- Reduced motion: Text appears instantly (no streaming animation), `prefers-reduced-motion: reduce` respected.

**When to Use**: LLM response rendering where latency perception matters.
**When NOT to Use**: Pre-computed results; use instant display instead.

---

### 3. Citation Badge

**Category**: Data Display
**Used In**: Ask Agent

**Description**: Inline badge linking a claim in the AI response to its source document. Shows source type icon and short label.

**Specification**:
- Display: Inline `[n]` superscript number + tooltip on hover/focus.
- Tooltip content: Source title, date, type (SEC filing, earnings, news, etc.).
- Click: Opens source URL in new tab (`target="_blank"`, `rel="noopener"`).
- Keyboard: Tab to badge, Enter to open source.
- ARIA: `<a>` with `aria-label` (e.g., "Citation 3: SEC 10-K, Apple Inc., 2024-Q4").
- Validation: Per ADR-0007, citations array must be non-empty for every answer.

**When to Use**: Any factual claim referencing an external source.
**When NOT to Use**: Common knowledge or general reasoning without source.

---

### 4. Tool Result Card

**Category**: Data Display
**Used In**: Ask Agent, Build Agent, Dashboard Agent

**Description**: Collapsible card showing the result of a tool call (get_quote, run_backtest, etc.) with cost, latency, and source metadata.

**Specification**:
- Layout: Card with header (tool name + source icon) and body (result data).
- Header shows: tool name, data source, latency badge, cost badge.
- Body: Tool-specific result (table for get_quote, chart for get_ohlc, JSON for others).
- Default state: Collapsed (header only) for completed tools.
- Expanded state: Full result visible.
- Keyboard: Enter/Space to toggle expand.
- ARIA: `role="region"` with `aria-label` (e.g., "Stock quote: NVDA $890.50 from Tiingo").
- Error state: Red border, error message in body, retry button.

**When to Use**: Displaying structured tool execution results.
**When NOT to Use**: Simple scalar values; use inline text instead.

---

### 5. Financial Chart Viewer

**Category**: Data Display
**Used In**: Ask Agent, Dashboard Agent

**Description**: Interactive price chart using lightweight-charts. Shows OHLCV data with configurable timeframe and optional overlays (strategy signals, comparison lines).

**Specification**:
- Library: lightweight-charts (Apache 2.0) per ADR-0002 conflict resolution.
- Timeframe selector: 1m, 5m, 15m, 1h, 1d buttons (toggle group).
- Crosshair: Shows OHLCV data at cursor position in tooltip.
- Zoom: Mouse wheel; pinch on touch (Phase 2).
- Pan: Click-drag.
- Keyboard: Arrow keys for pan, +/- for zoom, Tab to timeframe buttons.
- ARIA: Canvas `role="img"` with `aria-label` describing chart content.
- Mock mode: Loads from `/mock/klines/*.json` per ADR-0001.
- Loading state: Skeleton placeholder until data loads.
- Error state: "Data unavailable" message with retry.

**When to Use**: Any time-series price or indicator display.
**When NOT to Use**: Single-point values; use stat display instead.

---

### 6. Strategy DSL Editor

**Category**: Input
**Used In**: Build Agent

**Description**: Code-editor-like textarea for composing and editing strategy DSL. Supports syntax highlighting, validation, and LLM-assisted generation.

**Specification**:
- Base: `<textarea>` or CodeMirror-lite with DSL grammar.
- Validation: On-change with debounce (500ms); errors shown inline.
- LLM assist: "Generate with AI" button triggers Build Agent to draft DSL.
- Auto-save: Draft saved to D1 on blur (debounced 2s).
- Keyboard: Standard text editing (arrows, selection, copy/paste).
- ARIA: `role="textbox"` with `aria-multiline="true"`, `aria-label="Strategy DSL editor"`.
- Error annotations: Linked via `aria-describedby` to editor.

**When to Use**: Strategy creation and editing in Build Agent.
**When NOT to Use**: Read-only strategy display; use read-only code block.

---

### 7. Backtest Result Panel

**Category**: Data Display
**Used In**: Build Agent

**Description**: Tabbed panel displaying backtest metrics, equity curve, trade list, and risk statistics.

**Specification**:
- Tabs: Summary | Equity Curve | Trades | Risk Metrics.
- Summary: Key metrics cards (CAGR, Sharpe, Max DD, Win Rate).
- Equity Curve: Line chart (lightweight-charts).
- Trades: Paginated table with sort.
- Risk: Metric cards + drawdown chart.
- Keyboard: Tab through tabs, Arrow keys within tab content.
- ARIA: Tablist pattern per WAI-ARIA Authoring Practices.
- Loading: Skeleton per tab until backtest completes.

**When to Use**: Displaying strategy backtest results.
**When NOT to Use**: Live portfolio performance; use dashboard widget.

---

### 8. Watchlist Manager

**Category**: Navigation + Input
**Used In**: Dashboard Agent

**Description**: Sidebar or panel listing user's watched tickers with real-time/batched price updates and quick-action context menu.

**Specification**:
- Layout: Vertical list of ticker rows.
- Each row: Ticker symbol, last price, % change, sparkline (mini chart).
- Add: Search-as-you-type input at top; Enter to add.
- Remove: Right-click context menu or "×" button on row.
- Reorder: Drag-and-drop (Phase 2); up/down buttons (Phase 1).
- Keyboard: Tab to list, Arrow keys to navigate rows, Enter to open detail, Delete to remove.
- ARIA: `<ul>` with `<li>` items; `aria-label="Watchlist"`.
- Empty state: "Add a ticker to get started" with search input focused.

**When to Use**: Managing a list of tracked securities.
**When NOT to Use**: One-off ticker lookup; use search only.

---

### 9. Alert Notification

**Category**: Feedback
**Used In**: Dashboard Agent

**Description**: Toast notification for price alerts, strategy triggers, or system events.

**Specification**:
- Position: Bottom-right (desktop), top-center (mobile Phase 2).
- Auto-dismiss: 8s default, pause on hover, no auto-dismiss for errors.
- Types: Info (blue), Success (green), Warning (yellow), Error (red).
- Action: Optional action button (e.g., "View Strategy").
- Keyboard: Escape to dismiss, Tab to action button.
- ARIA: `role="alert"` for errors, `role="status"` for others; `aria-live="assertive"`.
- Stack: Max 3 visible; older ones collapse.

**When to Use**: Time-sensitive notifications requiring user awareness.
**When NOT to Use**: Persistent status; use status bar instead.

---

### 10. Agent Tab Switcher

**Category**: Navigation
**Used In**: Global

**Description**: Top-level navigation switching between Ask, Build, and Dashboard agent contexts.

**Specification**:
- Layout: Horizontal tab bar at top of main content area.
- Tabs: Ask | Build | Dashboard.
- Active tab: Highlighted with bottom border + color.
- Tab content: Each tab loads its own agent context (conversation, tools, state).
- Keyboard: Arrow Left/Right to switch tabs, Enter to activate.
- ARIA: Tablist pattern per WAI-ARIA Authoring Practices.
- Persistence: Active tab restored from D1 session on page reload.

**When to Use**: Primary navigation between agent workspaces.
**When NOT to Use**: Within-agent sub-navigation; use internal tab pattern.

---

### 11. Cost/Trace Status Bar

**Category**: Feedback
**Used In**: Global

**Description**: Persistent bottom bar showing current query cost (USD), step count, and trace status.

**Specification**:
- Layout: Fixed bottom bar, full width.
- Content: Total cost ($0.XX), Steps (N/20), Status (running/idle/error).
- Cost updates: On each LLM call completion (per ADR-0003 cost_cap).
- Steps: Incremented per Agent Loop state transition (per ADR-0004 TraceStep).
- Warning: Cost approaching $5 ceiling → yellow; at ceiling → red + "Query limit reached".
- Keyboard: Tab to bar, Enter to open full trace view (modal).
- ARIA: `aria-live="polite"` for cost/step updates.
- Reduced motion: No animation on cost change; instant number update.

**When to Use**: Always visible during active agent query.
**When NOT to Use**: Idle state between queries; show minimal/hidden.

---

### 12. Mock/Real Mode Toggle

**Category**: Input
**Used In**: Settings

**Description**: Toggle switch for USE_MOCK environment variable, controlling whether the app uses mock data or real API calls.

**Specification**:
- Display: Toggle switch with "Mock" / "Real" labels.
- Current state: Clearly indicated (green for Mock = safe, orange for Real = API calls active).
- Confirmation: Switching to Real mode requires confirmation dialog ("This will make real API calls that may incur costs. Continue?").
- Effect: Toggles `USE_MOCK` env var per ADR-0001.
- Keyboard: Enter/Space to toggle; Tab to navigate.
- ARIA: `role="switch"` with `aria-checked` and `aria-label="Data mode"`.
- Dev only: Hidden in production (`ENVIRONMENT=production`); always Mock in production per ADR-0001.

**When to Use**: Developer/demo settings for data mode switching.
**When NOT to Use**: Production UI; always Real in production.

---

## Gaps & Patterns Needed

| Gap | Priority | Phase |
|-----|----------|-------|
| Responsive mobile layout patterns | Medium | Phase 2 |
| Dark mode color scheme patterns | Medium | Phase 1.5 |
| Drag-and-drop reordering (watchlist, dashboard widgets) | Low | Phase 2 |
| Real-time data streaming indicator | Medium | Phase 1.5 |
| Keyboard shortcut overlay (Cmd+K palette) | Low | Phase 2 |

---

## Open Questions

1. Should the Chat Conversation pattern support message editing/re-send? (Deferred to Phase 2)
2. Should the Financial Chart support comparison overlay (multiple tickers)? (Phase 1.5)
3. Should the Cost/Trace Status Bar show per-tool cost breakdown inline, or only in expanded view? (Expanded view — Phase 1)

---

> **Last Updated**: 2026-07-19
