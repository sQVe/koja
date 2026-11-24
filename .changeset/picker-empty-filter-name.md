---
'koja': patch
---

Name the picker's status filter in its empty message. With a query typed and a filter other than
All, the picker said "No space matches.", which is the All filter's wording. It now says
`Nothing in <filter> matches "<query>".`, so the list names the filter it is using.
