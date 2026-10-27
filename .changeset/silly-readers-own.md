---
'koja': patch
---

`koja server stop` now reports a failed final save. It prints the server message to stderr and exits
1 instead of printing `{"stopped":true}`. Stopping a server of an older build works as before.
