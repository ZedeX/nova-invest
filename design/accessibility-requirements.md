# Accessibility Requirements — Nova Invest

> **Tier**: WCAG 2.1 AA
> **Date**: 2026-07-19
> **Status**: Active

---

## 1. Compliance Target

Nova Invest targets **WCAG 2.1 Level AA** compliance. This is the baseline for a public-facing web application with financial data display.

Level AAA items are noted as aspirational but not blocking.

---

## 2. Perceptibility

### 2.1 Text Contrast

| Context | Minimum Ratio | Standard |
|---------|--------------|----------|
| Body text | 4.5:1 | WCAG 1.4.3 AA |
| Large text (≥18px / ≥14px bold) | 3:1 | WCAG 1.4.3 AA |
| UI components & graphical objects | 3:1 | WCAG 1.4.11 AA |
| Disabled/muted elements | No minimum | Exempt per 1.4.3 |

### 2.2 Color Independence

- No information conveyed by color alone.
- Chart price movements (up/down) must use **both** color (green/red) AND shape (triangle up/down) or sign (+/−).
- Sentiment indicators (bullish/bearish) must include text label or icon alongside color.
- Status indicators (loading, error, success) must include icon or text label.

### 2.3 Text Resize

- UI must remain usable when text is resized to 200%.
- No horizontal overflow on body text at 200% zoom.
- Chart containers may scroll horizontally at extreme zoom (acceptable per WCAG 1.4.10 Reflow exception for data tables).

### 2.4 Low Vision

- Focus indicators must be visible (minimum 2px outline, 3:1 contrast against adjacent colors).
- No content disappears or becomes unusable when browser zoom is 100%–400%.

---

## 3. Operability

### 3.1 Keyboard Navigation

- All interactive elements reachable via Tab key.
- Logical tab order follows visual layout (left→right, top→bottom).
- Focus trapping in modals/drawers (Ask chat panel, strategy builder).
- Escape key closes modals, drawers, and dropdown menus.
- No keyboard traps except in intentionally trapped contexts (modal dialogs).

### 3.2 Focus Management

- Focus moves to newly opened modal/drawer on open.
- Focus returns to trigger element on modal/drawer close.
- Focus moves to new content after route change (Next.js router).
- Visible focus indicator on all interactive elements (shadcn/ui default meets this).

### 3.3 Timing

- No time-limited interactions in Phase 1.
- If time limits are added later (e.g., real-time data refresh), user must be able to pause/extend/disable per WCAG 2.2.1.

### 3.4 Touch Target Size

- Minimum 44×44 CSS pixels for all interactive elements (WCAG 2.5.8 AAA — applied as best practice).
- Applies to: buttons, links, chart tooltips, nav items, tool call result cards.

---

## 4. Understandability

### 4.1 Language

- Page language declared via `<html lang="zh-CN">` for Chinese, `<html lang="en">` for English.
- Language switches propagate to all ARIA landmarks.

### 4.2 Form Labels

- All form inputs have visible labels OR `aria-label` / `aria-labelledby`.
- Error messages associated with inputs via `aria-describedby`.
- Required fields indicated via `aria-required="true"` AND visual indicator (*).

### 4.3 Consistent Navigation

- Navigation order consistent across all pages.
- Navigation landmarks: `<nav>`, `<main>`, `<aside>`, `<footer>`.

---

## 5. Robustness

### 5.1 ARIA

- Use semantic HTML first; ARIA only when HTML semantics insufficient.
- All ARIA roles valid per WAI-ARIA 1.2.
- Live regions (`aria-live`) for:
  - Ask Agent streaming responses: `aria-live="polite"` on answer container.
  - Cost/trace updates: `aria-live="polite"` on status bar.
  - Error notifications: `aria-live="assertive"` on toast/error container.

### 5.2 Component Compliance

- shadcn/ui components meet WCAG 2.1 AA by default.
- Custom components (chart containers, citation badges, tool result cards) require manual audit.
- Third-party `lightweight-charts` has limited ARIA support — add `aria-label` and `role="img"` with description of chart content.

---

## 6. Application-Specific Requirements

### 6.1 Ask Agent Chat Interface

- Chat responses stream with `aria-live="polite"`.
- Citation badges are links with `aria-label` describing source (e.g., "SEC 10-K filing, Apple Inc., 2024-Q4").
- Tool call result cards have `role="region"` and `aria-label` (e.g., "Stock quote: NVDA $890.50").

### 6.2 Chart Display (lightweight-charts)

- Chart canvas has `role="img"` and `aria-label` (e.g., "NVDA daily price chart, 6 months, $800–$950 range").
- Price axis and time axis labels are accessible via `aria-label`.
- Tooltip content readable by screen readers (may require overlay div mirroring tooltip text).

### 6.3 Strategy Builder (Build Agent)

- DSL editor has `role="textbox"` with `aria-multiline="true"`.
- Validation errors linked to editor via `aria-describedby`.
- Backtest result panel is `role="region"` with `aria-label`.

### 6.4 Dashboard (Dashboard Agent)

- Widget grid uses `role="region"` per widget with descriptive `aria-label`.
- Alert notifications use `aria-live="assertive"`.
- Watchlist items are list items (`<li>`) in `<ul>`.

---

## 7. Testing Requirements

| Test Type | Tool | Scope |
|-----------|------|-------|
| Automated audit | axe-core via Playwright | All pages, every CI run |
| Keyboard navigation | Manual Playwright + keyboard | All interactive flows |
| Screen reader | NVDA (Windows) + manual | Ask chat, chart, strategy builder |
| Color contrast | axe-core | All custom components |
| Zoom/reflow | Manual at 200%, 400% | All pages |

### CI Integration

- Playwright E2E tests include `@axe-core/playwright` accessibility scan after each page navigation.
- Fail CI on any WCAG 2.1 AA violation (critical or serious).

---

## 8. Exemptions & Deferrals

| Item | Reason | Status |
|------|--------|--------|
| lightweight-charts canvas ARIA | Third-party; limited API | Partial — wrapper adds `role="img"` + `aria-label` |
| LLM streaming response timing | Dynamic content; `aria-live="polite"` is best effort | Best effort |
| Mobile touch gestures | Phase 2 (responsive mobile) | Deferred |
| Dark mode contrast | Phase 1.5 | Deferred |

---

> **Last Updated**: 2026-07-19
