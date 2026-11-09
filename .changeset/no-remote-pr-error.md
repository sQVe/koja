---
'koja': patch
---

Stop showing "Could not read PRs." in the spaces sidebar for a repository without a git remote. Such
a repository has no PRs, so its group shows no PR facts and no error line. A real failed read still
shows the error line with Retry. Sidebar error lines no longer show a tooltip that repeats their
text.
