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

In normal mode, `p` pastes the clipboard into the pane shown when you press it, and the client stays
in normal mode. Multiline text for a program without bracketed paste, from `p` or from the
terminal's own paste, asks `y/n` in the status bar first. The paste is canceled when the pane, its
process, the tab, or the workspace changes before it is sent. The status bar shows why a paste
failed or was canceled, and hides the tab labels while it shows a paste prompt or message.
