# ADR 0009: One flat base with rounded cards and accent focus

**Date**: 2026-11-03\
**Status**: Accepted\
**Related**: [ADR 0007 (One UI language through one kit)](./0007-one-ui-language.md)

## Context

Koja shows several work areas at once: panes, a side panel, a tab bar, and popups. Each one needs a
look that reads as one window. Earlier, the default light theme put white panes on a gray frame, and
the terminal looked too white.

Herdr sets the frame, pane borders, and dialogs. Herdr's overlay frame has rounded corners but does
not clip the popup's content to them. A popup that paints a square background shows its corners
outside the curved border.

[ADR 0007](./0007-one-ui-language.md) defines where sizes, radii, and colors come from. This ADR
records the visual rules that those sources produce.

## Decision

Koja uses one flat base color for the whole window, with rounded cards on top of it and an accent
border for focus. The frame, panes, terminals, sidebar, and tab bar all share the base color of
`catppuccin-latte-muted`, Koja's one theme.

### Panes and side panel

- Panes and the side panel are rounded cards with a faint `hover` outline.
- Focus shows as the `accent` border and a brighter header: the focused pane's title is `foreground`
  and its icon `muted`, while other panes use `muted` and `dim`. Koja adds no other focus mark.

### Tabs and controls

- The tab bar's tabs, the panel switcher, and the kit's toggle and icon buttons are pills. They
  round with the kit's `radius.pill`.
- A pill sits inside the bar on its own, so it works with any gap between the bar and the pane
  cards.

### Popups

- Popups keep Herdr's overlay frame, which draws on the `popover` color.
- Koja draws popup content through the kit's popup surface, which rounds the background to the
  frame's radius, because the frame does not clip it.

Herdr's own dialogs keep Herdr's frame. Koja's popups use the same frame, so popups look the same
whether Koja or Herdr opens them. The picker is the one exception: its list sits beside a terminal
preview inside one framed overlay, so the list rounds only its own two outer corners.

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

### Flat side panel with a divider

Draw the side panel flat, with a divider between it and the panes. Rejected because the work areas
would then have two shapes: cards for panes and a flat area for the side panel.
