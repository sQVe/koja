---
'koja': patch
---

Keep each mouse gesture bound to the input mode, pane, and pane process of its press. In normal and
scroll mode, a click selects the pane and keeps the mode, and the program in the pane gets no click,
drag, or release. The wheel still reaches it. In insert mode, a press, its drags, and its release
all go to the pressed pane, also when the mode, focus, or an open view changes in between. A release
never reaches a pane that did not get its press, or a pane that was replaced. Detaching during a
held click first sends the program its release.
