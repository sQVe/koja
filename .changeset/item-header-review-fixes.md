---
'koja': patch
---

Cut a long item state word in the header chip instead of letting it push past the header. The chip's
marks now come from one record, so a new state needs its own mark, and the in-review mark reuses the
shared blocked bubble. The document line and the action block each build their layout once.
