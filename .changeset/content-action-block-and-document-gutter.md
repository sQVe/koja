---
'koja': patch
---

Add the content pane's action block and document gutter to the kit. The action block draws one solid
main button that names its effect. A failed save makes `Retry save` the main button, with the error,
the folder on its own line, a `Copy path` recovery button, the unsaved count, and the dim line that
says the send waits for a save. A sent review draws the check and the next step instead of a
control. A document line draws a right-aligned line number, a warning bar on an edited line with
`edited` once, and a neutral bar on commented lines. The kit gains a monospace text role, which
draws in the terminal font from settings. The kit gallery's Content section shows each action state
and a document with edited and commented lines.
