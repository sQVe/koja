---
'koja': patch
---

Cancel a folder watch when Koja stops showing its folder. The Changes panel cancels its watch when
it moves to another repository or closes. The spaces sidebar cancels the watch of a repository no
space uses any more, and all its watches when it closes. A cancelled watch starts no refresh, so
Koja no longer holds watches against Herdr's limit of 64.
