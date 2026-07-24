# iReport Admin UI Design System

This is the shared visual and interaction source of truth for all iReport Admin tabs. New pages should extend these decisions rather than introduce a separate visual language.

## Product Context

- Product: desktop emergency incident operations console
- Primary users: desk officers, dispatchers, station chiefs, and provincial administrators
- Primary job: identify exceptions quickly, understand context, and take the next operational action
- Visual character: calm, precise, high-trust, information-dense, and non-decorative

## Design Principles

1. **Action before decoration**: every prominent warning should lead to a clear next action.
2. **Scan before read**: use short labels, stable columns, compact metadata, and visible status text.
3. **Context is explicit**: indicate current scope, filters, time range, and whether counts overlap.
4. **Color is supportive**: pair color with text, icons, shape, or position; never rely on color alone.
5. **Progressive density**: show the most important items first, with full detail one navigation step away.
6. **Consistent interaction**: clickable cards and rows need hover, focus, pressed/selected, and disabled states.

## Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `primary` | `#2563EB` | Primary navigation, links, selected actions |
| `primary-dark` | `#1D4ED8` | Hover/active primary action |
| `surface` | `#FFFFFF` | Cards, tables, controls |
| `canvas` | `#F8FAFC` | Page background |
| `ink` | `#0F172A` | Headings and primary data |
| `muted-ink` | `#64748B` | Supporting metadata |
| `border` | `#E2E8F0` | Card, table, and control borders |
| `pnp` | `#2563EB` | PNP identity |
| `bfp` | `#DC2626` | BFP identity |
| `mdrrmo` | `#0891B2` | MDRRMO identity |
| `warning` | `#D97706` | Pending, aging, SLA warnings |
| `danger` | `#DC2626` | Casualties, critical exceptions, errors |
| `success` | `#059669` | Connected, resolved, healthy state |

Dark mode uses the existing Tailwind dark surfaces and must preserve readable text contrast. Do not introduce new one-off colors when a semantic token above applies.

### Typography

- Page title: `text-2xl font-bold tracking-tight`
- Section heading: `text-base font-semibold`
- Body/data: `text-sm`
- Supporting metadata: `text-xs`
- IDs and codes: `font-mono text-xs`
- Avoid using text smaller than `11px` for information users must read repeatedly.

### Spacing and Shape

- Use the 4/8 spacing rhythm: `gap-2`, `gap-3`, `gap-4`, `p-4`, `mb-5`.
- Card radius: `rounded-xl`.
- Control radius: `rounded-lg`.
- Dense table/list row padding: approximately `py-2.5` to `py-3`.
- Avoid excessive empty vertical space in operational panels.
- Use borders for grouping; reserve shadows for elevation or selected/floating controls.

## Component Rules

### Page Header

- Use a direct page title such as `Incidents`, `Agency operations`, or `Activity logs`.
- Put the primary page action at the right, such as `Export PDF` or `Refresh`.
- Show the result count beside the action, not as a competing headline.

### Filter Toolbar

- Search comes first and expands into available space.
- Group filters in a single bordered surface.
- Every select has an accessible label, even when its visible label is the selected option.
- Disabled dependent filters must explain their dependency through disabled styling and sensible option text.
- Reset or clear controls should be added when multiple filters can be active.

### Status and Agency Badges

- Always show a text label with the color.
- Agency colors remain PNP blue, BFP red, and MDRRMO cyan across every tab.
- Status uses the shared `incidentStatus` vocabulary and dot-plus-label treatment.
- Multi-agency is purple and should include an icon or text, not only a color badge.

### Tables and Queues

- Rows are clickable when they open details and must have a visible hover/focus state.
- Keep the first scan line short: ID, agency, incident/location, status/assignment, age, action.
- Use compact rows for previews; use the full incidents page for exhaustive records.
- Right-align age and action columns when possible.
- Use an explicit chevron or `Review` action to communicate clickability.
- Preserve horizontal scrolling for wide tables rather than compressing critical data into unreadable text.

### Maps and Legends

- A map section should use direct language: `Incident location map`.
- Map markers and external legends use the same icon grammar.
- Agency legends are interactive filters, not decorative legends. Use `aria-pressed`, hover, focus, and selected-state styling.
- Map controls should have accessible names and visible tooltips where icons are used alone.

### Empty, Loading, and Error States

- Loading: show a skeleton or clear spinner with an accessible label.
- Empty: explain what is absent and what action or event will populate it.
- Error: state whether displayed data may be stale and offer `Retry`.
- Offline state must be visible and must not look like live data.

## Responsive Behavior

- Desktop: persistent sidebar and multi-column operational layout.
- Constrained desktop: preserve the primary table/list; collapse secondary panels before shrinking primary content.
- Small widths: use tabs or stacked sections rather than forcing wide tables into the viewport.
- Maintain minimum interactive target size around `40px` for desktop controls and `44px` where practical.

## Accessibility

- Never communicate status with color alone.
- Use sequential headings and semantic `button`, `input`, `select`, `table`, and `nav` elements.
- Add accessible names to icon-only buttons and filter controls.
- Ensure keyboard focus is visible.
- Keep secondary text readable against both light and dark surfaces.
- Do not use placeholder text as the only field label.

## Incidents Page Direction

- Treat `Incidents` as the exhaustive operational register, not a dashboard summary.
- Keep the filter toolbar prominent but compact.
- Make the table scannable with consistent column widths and direct status/assignment text.
- Keep `Export PDF` as the primary page action.
- Add a visible clear-filter path when filters are active.
- Preserve the shared agency/status colors and row interaction behavior from the Dashboard.
