---
'koja': minor
---

Draw the confirm dialog as the compact card: 360 px wide, the overlay card surface and outline, one
13 px text size, 24 px buttons, and an Enter keycap on the main button. A destructive ask puts a red
triangle-alert before its title, and the body lines up with the title text. The card grows with its
content, so a long space name never pushes the buttons out of the dialog.

The close-space confirm now reads `Close space “<name>”?` and names the agents that stop and the
tabs that close, then what stays. An agent still working stops mid-task; one that has finished
stops. A space with no agent running names only its tabs.
