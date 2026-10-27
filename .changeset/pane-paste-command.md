---
'koja': minor
---

Add `koja pane paste <text>` to paste text into a pane, encoded for the bracketed paste mode the
pane's program asked for. Multiline text for a program without bracketed paste is not sent. The
command prints `confirmationRequired` with an authorization and exits nonzero, and `--authorize`
sends the same text to the same running pane.
