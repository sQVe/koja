---
'koja': patch
---

Save the session durably. Each save syncs the temporary file, renames it over the session file, and
syncs the folder, so a crash or power loss leaves the complete old or the complete new session. A
failed save is logged, and a failed final save makes the server's stop report a cleanup failure
instead of success.
