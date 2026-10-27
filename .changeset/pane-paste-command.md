---
'koja': minor
---

Add `koja pane paste <text>` to paste text into a pane, encoded for the bracketed paste mode the
pane's program asked for. Multiline text for a program without bracketed paste is not sent. The
command prints `confirmationRequired` with an authorization and exits nonzero, and `--authorize`
sends the same text to the same running pane.

The client can read the system clipboard with `wl-paste`, `xclip`, or `xsel`, and reports why a read
failed: no local clipboard (over SSH or without a display), an empty clipboard, failed tools, a
timeout, or a cancel.
