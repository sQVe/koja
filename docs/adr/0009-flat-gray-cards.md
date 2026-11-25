# ADR 0009: A two-tone base with rounded cards and foreground focus

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

Koja uses two tones for the window, with rounded cards on top of the frame and a `foreground` border
for focus. The frame, sidebar, and tab bar share the frame color `#d0d3d9` (`chrome` and `canvas`).
The panes, the side panel, and the terminals share the pane body color `#dfe1e5` (`background` and
`surface`). Both tones come from `catppuccin-latte-muted`, Koja's one theme.

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
  - Badge: 9 px SemiBold `foreground`, on a fill of one theme token at the kit's badge alpha,
    because status-colored text on that tint falls below 4.5:1. Only the attention badge uses this
    fill, and it tints with `blocked`.
  - Tag: 9 px Regular, on a solid fill of the role's group color, with a 1 px outline in the same
    color. The kit draws the fill and outline opaque, without any alpha a theme override gives the
    role color, so the label is chosen against the color the chip shows. The label uses the theme's
    `foreground` or `background` token, whichever contrasts more with the fill. In Koja's own theme,
    the label keeps 4.5:1 on its fill, and the fill keeps 3:1 against the surface under it, as for
    any non-text edge; the theme gate checks both. In another theme, the label takes the better of
    the two tokens and can fall below 4.5:1 when a role color sits between them, because the role
    colors come from that theme. The role badge uses it. The group colors are `ansi4` for lead,
    `ansi6` for architect, `ansi2` for worker, `ansi3` for scout, reviewer, and checker, `ansi5` for
    qa and browser, and `muted` for any other role. No group uses a status color.
- A role fixes size and weight. A caller may change only its tone.
- Key hints use the detail role, so a hint reads as a detail beside a 13 px label.
- Line height stays Herdr's default. The kit adds no line-height value until a part needs wrapped
  text.
- Geist is wider than most sans fonts, and the smaller scale keeps the sidebar and tab titles about
  as dense as before.

### Panes and side panel

- Panes and the side panel are rounded cards on the frame, with a 1 px `border` outline in
  `#b6bbc4`, and they round with the kit's one radius, 6 px.
- Pane titles use the detail role, 11 px Regular. The focused pane's title is `foreground` and its
  icon `muted`; an unfocused pane's title is `muted` and its icon `dim`.
- Focus also shows as the 1 px `foreground` border. Herdr cannot dim or tint an unfocused terminal,
  so the border is the only mark of pane focus that reaches the terminal, and the focused header
  draws no fill. Koja adds no other mark of pane focus. The list cursor of a marked section is a
  separate mark; see [Selection and hover](#selection-and-hover).
- In normal mode, Koja's overlay holds the keyboard, so Herdr draws no focus border. The focused
  pane's header then draws an `accent` tint at alpha `18`, with its title and icon in `accent`. The
  tint stays this light so the title and folder keep 4.5:1 contrast. Insert mode keeps the look
  above.

### Pane headers

- A pane header shows, in order: program icon, name, the role badge when the pane has a role, the
  agent's task, branch, folder, and status, then its buttons. Its text uses the detail role.
- The role badge follows the name, so a terminal's role or profile reads beside its name. It is a
  solid chip in the group's color, with its label in the theme's text token that contrasts most with
  that fill. It shows its full label while the header has room. The folder and branch cut and drop
  first; then the label cuts at the end with an ellipsis, and hovering shows the full label. When
  the header is too narrow for the badge and the controls together, the badge cuts below the longest
  built-in name, so the controls stay in the pane. Built-in names stay whole at the widths the
  header supports.
- The branch shows only when it differs from its space's branch.
- When the header narrows, the folder cuts in the middle down to a minimum width, then drops whole.
  The branch does the same next. The task cuts at its end last. The status slot counts the mark that
  shows: a working or done mark takes its 12 px slot, "Needs you" takes its pill width, and an idle
  pane reserves nothing.
- In the kit header, a row without a task end-aligns its first trailing field, so the branch,
  folder, and status sit at the right end. The action follows them.
- Once a field drops, or the header is narrower than the compact width, one always-visible overflow
  button replaces the split, zoom, and close buttons. Its menu lists the task, branch, and folder as
  plain detail lines above those actions, so no field is out of reach. The button keeps its width
  before the name and badge take theirs, and it stays at the end of the row when a field drops.
- Every header button carries an accessible name beside its tooltip.

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

### Corners

- Koja rounds every corner of a part it draws with one radius, 6 px. Panes and the side panel, tabs,
  inset row pills, buttons, icon toggles, and the mode pill all use it. No mod sets a radius of its
  own.
- Badges, such as the role badge and the attention badge, round at 4 px, so a small mark does not
  round away its own shape.
- A card's inner radius follows its frame: where a header meets the card edge, the kit rounds it one
  px less than the frame, so the fill stays inside the card's curve.
- Herdr draws a popup's frame and does not clip the content to it, so popup content and the picker's
  outer corners round to the frame's own radius instead.

### Selection and hover

- Only one of these gets a fill: a selected row, the active tab, or the active toggle. A hovered one
  of them draws no fill.
- A hovered list row, tab, or toggle draws a 1 px pill outline in `selected`. A hovered tab or
  toggle also brightens its text and icon to `foreground`.
- In normal mode, the row under the list cursor of a marked section draws a 1 px pill outline in
  `accent`, also when it is selected or hovered. A selected cursor row keeps its fill. The outline
  is the only mark of a marked section: the section itself draws no border.
- If people find a selected item hard to tell from a hovered one, the kit adds one second cue to
  selected rows and active toggles, not a second hover style.
- An icon button has no selected state, so it keeps its hover fill.
- A hovered solid or danger button keeps its fill and label and draws a 1 px `foreground` ring,
  because fading would dim the label below AA.
- A hover-only control, such as a pane header button, keeps its space, so a row does not shift when
  it appears.
- Both kinds of sidebar project header end the same way: the hidden count when folded, then the age
  of the main space when it has one, then the fold chevron in the last slot. A folded header always
  shows `chevron-right`. An open header shows `chevron-down` only on hover and otherwise keeps the
  empty slot. A header whose project has nothing to fold shows no chevron.
- Sidebar projects sit one group gap apart, with no line between them. Space alone separates them.

### Truncation

- An identifier, such as a branch, path, or worktree name, cuts in the middle, so its start and end
  stay visible. A title or prose cuts at the end.
- Where Herdr can show a tooltip, it holds the full name.

### Tabs and controls

- The tab bar's tabs, the panel switcher, and the kit's toggle and icon buttons are pills. They
  round with the kit's `radius.default`.
- Inset list rows, such as sidebar rows, menu rows, and picker rows, also round with
  `radius.default`. A selected row is therefore a pill.
- A pill sits inside the bar on its own, so it works with any gap between the bar and the pane
  cards.
- The panel switcher is a row of icon-only toggles. Each names its panel in a tooltip and an
  accessible name, so four panels fit at the bar's right end.
- Normal mode shows as a "Normal" pill with `accent` text in a `selected` outline. It is a status
  label, not a control, and shows only while normal mode is on.

### Status marks

- Done draws a small check icon in `done` green. A sidebar space that needs you draws the
  `message-circle-question` icon in `blocked` red. Tabs and picker rows keep the `blocked` dot, or
  the badge where there is room. Working stays the spinner, so shape as well as color tells the
  states apart.
- A sidebar space with no agent shows a hollow ring in the `border` color, so every space row has a
  mark and the list reads as one column. The ring is quieter than the filled idle dot, so it does
  not read as a state. Rows outside the sidebar, such as tabs and picker rows, keep an empty slot.
- A sidebar project header is the exception to the ring. Every header reserves the mark slot, so
  every project name starts at the same x. A header that is the project's main space shows that
  space's mark only when it is working, blocked, or done, and otherwise keeps the slot empty. A
  header with no main space keeps the slot empty and draws its name in `muted`.
- A work icon at a row's end names the one thing a stack needs, as a 12 px icon in a fixed slot.
  Conflict and CI failing draw in `blocked`, review and restack needed in `ansi3`, and ready to
  merge in `done`. Red asks to fix, amber asks to act, and green says the work is done. Each icon
  also differs in shape, so color is never the only cue. The slot carries the need's name as a
  tooltip and an accessible name, and a row with no need keeps the empty slot so the column stays
  aligned.
- Stack progress is a 12 px by 3 px bar with rounded ends, then the count in the detail role. The
  track is `dim` at alpha `33` and the fill is solid `dim`. The see-through track shows on the frame
  and on a selected row's fill alike, and the bar stays as quiet as the detail text beside it. A
  stack with no pull requests draws an empty track.

### Links

- Link text, such as a ticket or pull request id, draws in the detail role in `foreground`,
  underlined, with a pointer cursor. Plain detail text is `dim`, so the brighter color and the
  underline tell a link from a fact without a second color.

### Popups

- Popups keep Herdr's overlay frame, which draws on the `popover` color.
- Koja draws popup content through the kit's popup surface, which rounds the background to the
  frame's radius, because the frame does not clip it.

Herdr's own dialogs keep Herdr's frame. Koja's popups use the same frame, so popups look the same
whether Koja or Herdr opens them. The picker is the one exception: its list sits beside a terminal
preview inside one framed overlay, so the list rounds only its own two outer corners.

- A hover card is a `popover` card with a 1 px `border` outline and `radius.default` corners. An
  arrow 4 px deep on its left edge points at the row it describes. GPUI cannot rotate a box, so the
  arrow is 1 px columns that grow 2 px each, which keeps both edges at 45 degrees and crisp. A fill
  layer 1 px inside the outline layer covers the card's left border, so arrow and card read as one
  shape.

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
- A stale list keeps its rows below an error line with the age of the last good read. The age comes
  early in the text, so a cut line still shows it.
- The sidebar's PR read is the exception. Its line reads `Could not read PRs`, with no repository
  name and no age, because the project header above it names the repository and the sidebar shows
  only what the user should act on. The rows keep their last facts.
- A load longer than about 300 ms shows the spinner with its text; a shorter load shows nothing.
- An action that changes state, such as Commit, stays disabled on stale data until the same resource
  reads again. Reading and navigation stay allowed.

## Consequences

### Positive

- Every work area sits on one frame, with one card shape and one focus color, so the window reads as
  one surface.
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

### One flat base for the whole window

Use one base color for the frame, the panes, the terminals, the sidebar, and the tab bar, as the
earlier light theme did. Rejected because the panes then read as cut-outs of the frame rather than
as cards on it, and the window loses the structure that the two tones give it.

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

### Focus shown by a fill on the header

Draw a faint fill on the focused pane header in both modes, as before. Rejected because the border
and the brighter title already mark the focused pane in insert mode, and a second kind of fill made
a focused header read as selected. Normal mode keeps its tint, because Herdr draws no focus border
while Koja's overlay holds the keyboard.

### Done as a green dot

Draw done as a dot in `done` green, as before. Rejected because only color then told done from needs
you.

### Labelled panel switcher tabs

Show each panel's name as text in the tab bar. Rejected because four labelled panels crowd the tabs
out of the bar.

### Header fields that only show on hover

Hide dropped fields and show them in a tooltip on hover. Rejected because a keyboard or touch user
could not reach them, while the overflow menu is always visible.

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

### A line between sidebar projects

Draw a 1 px line in `selected` in the gap between sidebar projects, inset 4 px from each side of the
list. Rejected because the line has the color and width of the hover outline and selected fill of
inset rows, and sits about 3 px from their edge. A hovered or selected row next to it looked like it
had a doubled border.

### A third label token for flat themes

Add `accent_foreground` as a third label candidate, for themes such as Herdr's `win98`, whose
`foreground` and `background` are both black. Rejected because a third token would fix only the
badge label; the pane header's `foreground` text on `background` stays black on black in such a
theme. Herdr's Settings picker lists `win98` only with its own layout.
