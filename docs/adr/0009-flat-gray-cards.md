# ADR 0009: One flat base with rounded cards and accent focus

**Date**: 2026-11-03\
**Status**: Accepted\
**Related**: [ADR 0007 (One UI language through one kit)](./0007-one-ui-language.md)

## Context

Koja shows several work areas at once: panes, a side panel, a tab bar, and popups. Each one needs a
look that reads as one window. White panes on a gray frame make the terminal look too white.

Herdr sets the frame, pane borders, and dialogs. Herdr's overlay frame has rounded corners but does
not clip the popup's content to them. A popup that paints a square background shows its corners
outside the curved border.

[ADR 0007](./0007-one-ui-language.md) defines where sizes, radii, and colors come from. This ADR
records the visual rules that those sources produce.

## Decision

Koja uses one flat base color for the whole window, with rounded cards on top of it and an accent
border for focus. The frame, panes, terminals, sidebar, and tab bar all share the base color of
`catppuccin-latte-muted`, Koja's one theme.

### Text

- Mods draw their text in Geist, Herdr's bundled sans font, set as the layout's `ui_font`. Terminals
  keep their own monospace font.
- Herdr bundles only Geist Regular and thickens it for heavier weights, so semibold and bold look
  the same. Koja installs Geist SemiBold and Bold into Herdr's `fonts/` folder so each weight draws
  its real face.
- The kit uses only Regular 400 and SemiBold 600. Geist ships a real Bold face too, but the kit uses
  it nowhere. Medium 500 is not a real face, so Herdr synthesizes it.
- Mods set text only through a role, never a raw size or weight. The kit's roles run:
  - View title: 15 px SemiBold `foreground`, for a ticket, PR, or draft view.
  - Title: 13 px SemiBold `foreground`, for a panel or dialog heading.
  - Body: 13 px Regular `foreground`, for row labels, tab names, menu items, and input text.
  - Section heading: 11 px SemiBold `muted`, for repository names and group headings.
  - Detail: 11 px Regular `dim`, for a branch, age, count, hint, or state line.
  - Badge: 9 px SemiBold, in the status color.
- A role fixes size and weight. A caller may change only its tone.
- Key hints use the detail role, so a hint reads as a detail beside a 13 px label.
- Line height stays Herdr's default. The kit adds no line-height value until a part needs wrapped
  text.
- Geist is wider than most sans fonts, and the smaller scale keeps the sidebar and tab titles about
  as dense as before.

### Panes and side panel

- Panes and the side panel are rounded cards with a faint `selected` outline.
- Pane titles use the detail role, 11 px Regular. The focused pane's title is `foreground` and its
  icon `muted`; an unfocused pane's title is `muted` and its icon `dim`.
- Focus also shows as the `accent` border. Koja adds no other focus mark.

### Rows

- Koja uses one fixed density. Two one-line row classes exist: 24 px in panel lists such as the
  sidebar, Changes, side panels, and menus, and 28 px in search popups such as the palette and
  picker.
- A later session may add one kit-owned multi-line row class, measured in its own scenes. No other
  height is added ad hoc.
- Every list draws its rows through the kit's list row, so padding, gaps, and the pill stay the
  same.

### Buttons and icons

- The kit has two button sizes: a 22 px button and a 16 px small button for use inside a row.
- An icon button draws a 12 px icon. Icons come from the kit's Lucide set at stroke 2, drawn from
  one `lucide-static` release.
- The kit draws an icon at 10, 12, 14, or 16 px. A mod never picks an icon size outside that scale.

### Selection and hover

- Only one of these gets a fill: a selected row, the active tab, or the active toggle. A hovered one
  of them draws no fill.
- A hovered list row, tab, or toggle draws a 1 px pill outline in `selected`. A hovered tab or
  toggle also brightens its text and icon to `foreground`.
- If people find a selected item hard to tell from a hovered one, the kit adds one second cue to
  selected rows and active toggles, not a second hover style.
- An icon button has no selected state, so it keeps its hover fill.
- A hover-only control, such as a pane header button or the sidebar fold chevron, keeps its space,
  so a row does not shift when it appears.

### Truncation

- An identifier, such as a branch, path, or worktree name, cuts in the middle, so its start and end
  stay visible. A title or prose cuts at the end.
- Where Herdr can show a tooltip, it holds the full name.

### Tabs and controls

- The tab bar's tabs, the panel switcher, and the kit's toggle and icon buttons are pills. They
  round with the kit's `radius.pill`.
- Inset list rows, such as sidebar rows, menu rows, and picker rows, also round with `radius.pill`.
  A selected row is therefore a pill.
- A pill sits inside the bar on its own, so it works with any gap between the bar and the pane
  cards.

### Status marks

- A sidebar space with no agent shows a hollow ring in the `border` color, so every space row has a
  mark and the list reads as one column. The ring is quieter than the filled idle dot, so it does
  not read as a state. Rows outside the sidebar, such as tabs and picker rows, keep an empty slot.

### Popups

- Popups keep Herdr's overlay frame, which draws on the `popover` color.
- Koja draws popup content through the kit's popup surface, which rounds the background to the
  frame's radius, because the frame does not clip it.

Herdr's own dialogs keep Herdr's frame. Koja's popups use the same frame, so popups look the same
whether Koja or Herdr opens them. The picker is the one exception: its list sits beside a terminal
preview inside one framed overlay, so the list rounds only its own two outer corners.

### Motion

- A popup or a row that appears shows at once. Herdr's `transition` animates later changes but not a
  first appearance, so a fade in cannot draw. The kit holds no fade value and Koja draws none.
- Hover changes stay instant. Herdr cannot animate color.
- The only animation the kit draws is the working spinner, which turns over 900 ms.
- Koja animates nothing through a notify timer. A mod redraw redraws the whole window.
- Koja adds no reduced-motion branch. Herdr snaps `transition` under the system setting, and the
  spinner ignores the setting.

### States

- One kit component, the state line, draws empty, loading, and error. It is one line of text with an
  optional action: a button or a key hint.
- Empty draws no icon, loading draws the spinner, and error draws the alert icon in `blocked`.
- The line says what is true and what to do next. Every read that fails shows an error line, so no
  read fails silently.
- An error line names the resource that failed and sits with the part it affects. It carries its own
  Retry.
- Each mod keeps the pending, failed, stale, and fresh state of each resource apart, keyed by the
  repository or context it read. Retry reads that resource again at once, skipping the normal
  refresh delay. An error clears only when that same resource reads again.
- A stale list keeps its rows below an error line with the age of the last good read.
- A load longer than about 300 ms shows the spinner with its text; a shorter load shows nothing.
- An action that changes state, such as Commit, stays disabled on stale data until the same resource
  reads again. Reading and navigation stay allowed.

## Consequences

### Positive

- Every work area shares one base, one card shape, and one focus color, so the window reads as one
  surface.
- Mods take text, rows, buttons, and states from the kit, so a rule changes in one place and a test
  catches a mod that sets its own text size or weight.
- Users see every failed read, and never act on stale data by mistake.

### Negative

- One fixed density and two row heights leave no room for a compact or roomy setting.
- Popups and rows appear without a fade, because Herdr cannot animate a first appearance.
- Hover is a faint outline, so selection and hover rely on fill alone until a second cue is needed.
- Each mod must track its reads per resource to show error and stale lines, which adds state to
  every mod that reads.

## Alternatives considered

### Koja draws its own popup frame

Koja would set `frame: "none"` on its popups and copy Herdr's border, radius, and shadow by hand.
Rejected because Koja would have to follow every Herdr change to that copy, while a rounded
background inside Herdr's frame already gives clean corners.

### White panes on a gray frame

Use white panes on a gray frame, as the earlier light theme did. Rejected because the terminal
looked too white.

### No outline on unfocused panes

Leave unfocused panes without an outline. Rejected because two unfocused panes run together.

### Joined tabs

Draw the active tab in the pane color, open at the bottom so it runs into its pane. Rejected because
it only works when the tab touches the pane, which breaks with the gap around the pane cards.

### IBM Plex Sans as the mods' font

Keep IBM Plex Sans, the earlier `ui_font`. Rejected because its letter shapes are busier than
Geist's in the dense sidebar and tab rows.

### Geist at the earlier text sizes

Use Geist at 14 and 12 px. Rejected because Geist's wider letters then cut sidebar and tab titles
short sooner than IBM Plex Sans did.

### Inter or Roboto

Use another installed sans font. Rejected because neither ships with Herdr, while Geist does, so
Koja would depend on a font the machine may lack.

### Flat side panel with a divider

Draw the side panel flat, with a divider between it and the panes. Rejected because the work areas
would then have two shapes: cards for panes and a flat area for the side panel.

### Fade in appearing popups and rows

Fade a popup or a row in over 150 ms with `transition` on opacity. Rejected because Herdr's
`transition` does not animate a first appearance, so the element would draw at full opacity anyway.

### Read the system reduced-motion setting in Koja

Disable the spinner and any fade when the system asks for reduced motion. Rejected because mods
cannot read the flag, Herdr already snaps `transition` under the setting, and the spinner is the one
animation the kit draws.

### Dimmed names for spaces with no agent

Keep the empty slot and draw the names of spaces with no agent in `muted`. Rejected because the slot
stays empty, so rows with and without a mark still do not read as one column.

### A ring in the idle color

Draw the ring in the `idle` color. Rejected because it then looked as heavy as the idle dot.
