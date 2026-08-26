# Tensorlane design system

Tensorlane is serious infrastructure for AI/ML teams. The UI is one product: dark navy chrome, a bright workspace, purple as the only loud accent.

This document is the source of truth for visual decisions. Implementation lives in `tensorlane/web/app/globals.css` (`:root` tokens) and `tensorlane/web/components/ui/`.

## Principles

- Professional, technical, dense, trustworthy.
- Usability over decoration. No glassmorphism, giant type, consumer illustration, or rainbow dashboards.
- One component for each job (one DataTable, one Modal, one Toast).
- Semantic color for status, **plus** a text label. Color is never the only signal.
- Moderate radius (6–8px), thin borders, subtle shadow, compact padding.

## Reference

Primary visual target: the Tensorlane dashboard mockup (navy sidebar, white workspace, purple selected nav, metric cards with sparklines, dual charts, recent runs table). When a mockup asset is not in-repo, follow this document rather than inventing a third palette.

## Tokens

Defined as CSS custom properties. Components consume tokens, not hex.

| Token | Role | Value |
| --- | --- | --- |
| `--color-sidebar` | Sidebar / auth story | `#0b1220` |
| `--color-sidebar-muted` | Section labels | `#64748b` |
| `--color-sidebar-text` | Nav items | `#94a3b8` |
| `--color-sidebar-text-active` | Selected nav | `#f8fafc` |
| `--color-sidebar-hover` | Hover row | `#151d2e` |
| `--color-primary` | Actions, selected, links | `#6d28d9` |
| `--color-primary-hover` | Hover | `#5b21b6` |
| `--color-primary-soft` | Selected nav fill, chips | `#ede9fe` |
| `--color-secondary` | Charts, info | `#2563eb` |
| `--color-success` | Completed / healthy | `#059669` |
| `--color-warning` | Degraded / running | `#d97706` |
| `--color-danger` | Failed / destructive | `#dc2626` |
| `--color-background` | App canvas | `#f4f6f9` |
| `--color-surface` | Cards, tables, header | `#ffffff` |
| `--color-border` | Hairline | `#e2e8f0` |
| `--color-text-primary` | Body | `#0f172a` |
| `--color-text-secondary` | Lede, captions | `#64748b` |
| `--radius` | Cards, inputs | `8px` |
| `--radius-sm` | Buttons, badges | `6px` |
| `--shadow` | Cards | `0 1px 2px rgba(15, 23, 42, 0.06)` |
| `--space-*` | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 | |

Chart series (fixed, not rainbow): primary purple, secondary blue, success green, warning orange. A fifth series uses `--color-sidebar-muted`.

## Typography

IBM Plex Sans (UI) and IBM Plex Mono (IDs, keys, snippets).

| Role | Size / weight |
| --- | --- |
| Display (auth only) | 36px / 500 |
| Page title | 22px / 600 |
| Section title | 16px / 600 |
| Card title | 13px / 600 |
| Body | 14px / 400 |
| Small | 13px / 400 |
| Caption | 12px / 500, uppercase tracking on kickers only |
| Code / IDs | 12px IBM Plex Mono |

Do not use a display serif. Do not set page titles above 28px in the app shell.

## Layout

```
┌──────────┬────────────────────────────────────────┐
│ Sidebar  │ Header: breadcrumb · search · docs ·  │
│ 240 / 72 │         notifications · user          │
│ navy     ├────────────────────────────────────────┤
│          │ Page content (max ~1280px, 24px pad)  │
└──────────┴────────────────────────────────────────┘
```

- Sidebar collapse stores `tensorlane.sidebar.collapsed` in `localStorage`.
- Collapsed: icons + tooltips, no section labels.
- Header is 56px, white, hairline bottom.
- Content background is `--color-background`; cards are `--color-surface`.

## Components (contract)

See [component-inventory.md](./component-inventory.md). Every page uses:

- `PageHeader` for title + actions
- `DataTable` for lists
- `StatusBadge` for run/trace/deployment state
- `MetricCard` / `ChartCard` for analytics
- `EmptyState` / `ErrorState` / table and card skeletons
- `Modal` for create/delete; `Drawer` for inspect-in-place
- `Toast` for success/warning/error/info

## Interaction

- Focus: 2px `--color-primary` outline, 2px offset.
- Selected nav: purple fill on navy (`rgba(109, 40, 217, 0.38)`), white label.
- Buttons: primary filled purple; secondary white + border; danger outline red.
- Motion: 120–180ms opacity/transform only. No bounce, no page-wide fade.

## Accessibility

WCAG AA. Keyboard: sidebar, tables, command palette (↑↓ Enter Esc), modal focus trap. Status badges include a text label. Skip link remains.

## Theming later

Tokens are centralized so a future dark-workspace theme can swap `--color-background` without restyling 30 pages. Do not add a second theme in this pass.

## Inspectability

In-app showcase: `/design-system`. Storybook is not in this repository; do not add it solely for this pass (npm 7-day cooldown, extra toolchain). The showcase page is the design-system surface.
