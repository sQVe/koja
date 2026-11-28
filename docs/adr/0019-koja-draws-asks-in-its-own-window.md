# ADR 0019: Koja draws agent asks in its own floating window

**Date**: 2026-11-26\
**Status**: Accepted\
**Related**: [ADR 0007 (One UI language through one kit)](./0007-one-ui-language.md),
[ADR 0009 (One flat base with rounded cards and accent focus)](./0009-flat-gray-cards.md)

## Context

An agent ask the user cannot see must interrupt. Herdr already plays a sound and posts a toast when
an agent is blocked. Herdr places and dismisses the toast; it is not a card that stays until the ask
is handled. Leaving Herdr's alert on would show two alerts for one ask.

Herdr's typed agent data carries the ask kind and its message, so Koja knows what to show without
reading the terminal screen. A mod can open a floating window with no Herdr frame and draw the whole
surface itself.

## Decision

Koja draws an agent ask the user cannot see in its own floating window, with its own sound.

The window uses `openOverlay({ kind: "window", frame: "none" })`, so Koja draws the card's surface,
text, and controls. The card never takes keyboard focus. It stays until the ask is handled:
answered, gone to, or dismissed, with no timeout.

The card is placed in physical pixels: Herdr reads `at` as raw pixels and scales only `width` and
`height` by the zoom, so the mod converts the layout widths and the card size itself. When
`window.json` holds a maximized or full-screen state, its bounds are the last windowed bounds, so
the card opens centered instead. A windowed resize reopens the card at the new place, because the
host compares a content-and-geometry signature on each poll.

The card is a passive overlay. The normal-mode hold ignores `koja-asks` when it checks whether
another overlay holds the keyboard, because the card never takes the keyboard.

Koja owns the card and its sound for an ask. Herdr's automatic sound is off through the
`sounds.enabled` setting the installer writes, and Koja plays the blocked sound once for each ask
the user cannot see. No other case plays a sound.

Koja also draws notifications in its own look through the `koja-toast` mod, which the layout puts in
place of Herdr's shipped toast. Koja's toast mod hides Herdr's toast for an ask whose card shows,
using the same ask rule as the card, so one ask makes one alert. An ask the card skips, a worker's
ask or one in the tab the user looks at, keeps Herdr's toast.

## Consequences

### Positive

- One owner for the look and the alert: a change to the card or its sound lands in one place.
- The card follows Koja's theme and type, like every other surface.
- The card sits above the layout, so it reaches the user while they work in another tab.

### Negative

- A window sits under dialogs, so a dialog covers the card until it closes.
- A window cannot be placed against the focused pane's rectangle, because Herdr exposes no pane
  geometry. The card sits at the bottom of the main column instead. A maximized window falls back to
  the centered placement, because its last windowed bounds are stale and a mod cannot read the live
  viewport.
- A window cannot pass clicks through its transparent area, so the card's window is kept as small as
  its content.

## Alternatives considered

### Herdr's `notify()` toast

The toast now draws in Koja's look through the `koja-toast` mod, so it can follow the card's style.
Rejected as the card itself because Herdr decides where the toast shows and when it goes, while the
card must stay until the ask is handled.

### A mark in the tabs and the sidebar only

Marks do not interrupt. Rejected because an ask the user cannot see must reach them before they open
its tab.
