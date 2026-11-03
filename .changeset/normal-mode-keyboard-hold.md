---
'koja': patch
---

Fix normal mode losing the keyboard after it moves focus. A pane, tab, or space action now takes the
keyboard back as soon as Herdr applies the move, so the next key reaches normal mode instead of the
terminal. A loss normal mode did not cause keeps the status check, but a `toast` no longer blocks
it, lookups back off while another overlay stays open, stale replies are dropped, and a reply
without an overlay list keeps the current keyboard owner. When a palette or picker closes, normal
mode checks the keyboard owner at once instead of waiting out the backoff.
