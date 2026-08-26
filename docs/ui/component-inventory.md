# Tensorlane component inventory

All new primitives live under `tensorlane/web/components/ui/` unless noted. Pages must not fork table markup, modal markup, or toast markup.

## Shell

| Component | File | Status |
| --- | --- | --- |
| AppShell | `components/Shell.tsx` | Rebuild |
| Sidebar | `components/shell/Sidebar.tsx` | New |
| Header | `components/shell/Header.tsx` | New |
| OrganizationSwitcher | `components/shell/ContextSwitchers.tsx` | New |
| WorkspaceSwitcher | same | New |
| CommandPalette | `components/shell/CommandPalette.tsx` | New |
| NotificationCenter | `components/shell/NotificationCenter.tsx` | New |
| UserMenu | `components/shell/UserMenu.tsx` | New |
| Wordmark | `components/Wordmark.tsx` | Variant for navy/light |
| UsageBanner | `components/UsageBanner.tsx` | Keep, restyle via CSS |

## Page chrome

| Component | File |
| --- | --- |
| PageHeader | `components/PageHeader.tsx` |
| EmptyState | `components/ui/EmptyState.tsx` (re-export from PageHeader for compat) |
| ErrorState | `components/ui/ErrorState.tsx` |
| Skeleton | `components/ui/Skeleton.tsx` |

## Data display

| Component | File |
| --- | --- |
| DataTable | `components/ui/DataTable.tsx` |
| StatusBadge | `components/ui/StatusBadge.tsx` |
| MetricCard | `components/ui/MetricCard.tsx` |
| ChartCard | `components/ui/ChartCard.tsx` |
| Sparkline / LineChart / BarChart | `components/ui/Charts.tsx` (SVG, no chart package) |
| ActivityFeed | `components/ui/ActivityFeed.tsx` |
| UsageMeter | CSS `.meter` |
| Pagination | inside DataTable |
| FilterBar / SearchInput | `components/ui/FilterBar.tsx` |
| CodeBlock + CopyButton | `components/ui/CodeBlock.tsx`, `components/CopyButton.tsx` |
| Tabs | `components/ui/Tabs.tsx` |

## Overlays

| Component | File |
| --- | --- |
| Modal | `components/ui/Modal.tsx` |
| Drawer | `components/ui/Drawer.tsx` |
| Toast + provider | `components/ui/Toast.tsx` |
| ConfirmDialog | Modal variant |

## Forms

Native labeled fields (`.field`). `FormField` wrapper in `components/ui/FormField.tsx` for description + error. Do not use placeholder-as-label.

## Icons

Inline SVG set `components/ui/Icons.tsx`. No icon package.

## Deprecated / do not duplicate

- Per-page `<table className="data">` for new lists — use DataTable.
- Copper/serif wordmark styling.
- Full-screen spinners.
- New CSS hex outside `:root`.

## Showcase

`/design-system` renders buttons, badges, tables, cards, tabs, empty/error/loading, charts.
