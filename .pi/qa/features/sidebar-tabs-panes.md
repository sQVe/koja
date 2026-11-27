# Sidebar, tabs, and panes

Target: sandbox

Drive the spaces sidebar, the tab strip, the pane headers, and their menus in the sandbox the brief
names. Follow [the rules for every section](../../qa.md#rules-for-every-section) of the QA guide
first.

## Entry points

| Entry point | How to use it                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| Sidebar     | A click on a space row or a project header, a drag on a space row, and a chevron |
| View switch | A click on `Projects` or `Inbox` above the sidebar list                          |
| Tab strip   | A click or a drag on a tab, and a click on the plus button                       |
| Menus       | A right click on a space, a project header, or a tab. Button 3 is the right one  |

## Driving steps

1. Run `bun run sandbox shot <file>` and read each coordinate from the image.
2. Use one entry point. `bun run sandbox` alone prints the arguments of each input command.
3. Take a `shot` after each step that should change the screen.

## Observable results

- The sidebar lists every space under the name of its project, one line per space: its mark and its
  title. A space row shows no PR number and no branch.
- `Projects` and `Inbox` sit on the only line above the list. The active view has the filled pill.
  The sidebar opens in the view of the last choice, and that choice survives a restart.
- `Inbox` regroups the same spaces into `Agent asks`, `PR needs you`, `Running`, and `Quiet`, in
  that order, with a dim count beside each header. A space sits in the first group that holds it: a
  blocked agent first, else a PR need, else a working agent, else Quiet. Empty groups are left out.
  Project folds do not apply, and the main checkout is a plain row.
- An Inbox row shows the agent mark and the title, then at the right the project name in dim text,
  the age, and the work icon. The project name is capped in width and cuts at its end. Inbox has no
  drag and drop and no folds. A click selects the space, and a right click opens its menu.
- A view switch scrolls the active space into view again. In the sidebar's mark mode, the cursor
  moves through the rows in the order they are drawn.
- A space row ends with one work icon for the most blocking need across its stack's pull requests,
  such as `CI failing`, with a tooltip, and an empty slot when nothing is needed.
- An unnamed space row shows the title of the Linear ticket of its branch, else the PR title of its
  branch, else the folder name. A named space row keeps its name.
- The main checkout of a Git repository is the project header, not a row. The header shows the
  repository name, and no space row repeats it. Before the name, it shows that space's mark only
  while the agent is working, blocked, or done. Otherwise the slot stays empty, so every project
  name starts at the same place.
- A space on the `qa-remote` fixture machine shows a `remote-fixture` project header that carries
  the `qa-remote` label with the server icon. There is no separate machine header.
- A click selects a space with the gray fill. A click on a project header selects its main checkout
  the same way. A hovered row or header that is not selected shows a 1 px outline. A selected one
  keeps its fill and shows no hover outline. The list cursor shows its own accent outline.
- Hovering a project header that has other spaces shows a chevron at its right end. A click on the
  chevron folds the project to its active spaces and the spaces that need the user, shows `N more`,
  and does not change the selected space. A click on the chevron of a folded project opens it again.
- A folded header ends with `N more`, then the age of its main space when it has one, then the
  chevron. A header without a main checkout has no age.
- A project without a main checkout, such as only linked worktrees or a folder outside Git, has a
  name-only header in a muted tone. A click on that name folds the project, and a second click opens
  it again. Hovering it shows the chevron at its right end, as on a main checkout header.
- An empty gap separates two projects in the sidebar, with no line in it. A hovered or selected row
  next to the gap shows only its own outline or fill.
- A new space shows under its project.
- A space row dragged onto another space of its own project lands there, above it when moving up and
  below it when moving down. The project order does not change, and `s j` follows the new order.
- While a drag hovers a row of another project or a project header, that row shows no drop line and
  the pointer is the not-allowed cursor. A drop there leaves the order unchanged.
- A press and release on the same row or header selects its space, as a click does.
- The tab strip shows the tabs of the selected space.
- A click selects a tab, a drag reorders the tabs, and the plus button opens the New menu.
- Each pane has a header with its label, and the focused pane has the accent border.
- A right click on a space or a tab opens a menu for that item, not for the focused one.
- The New menu lists Terminal and the installed agents, then the space actions. With no agent
  installed it says so, and its worktree rows name the repository they work from.

## End state

The tester names the space each click selected, the order after a drag, and the menu each right
click opened. The tab strip and the pane headers followed the selected space.

## Gotchas

- Read the New menu. Launch nothing from it.
- Agent launch, agent status, and real SSH machines are not testable. They need real agents and
  servers. Pull request titles come from the [PR rows fixture](../../qa.md#pr-rows-fixture), which
  fakes `gh` on the sandbox and the second machine. A fixture repository without a remote has no
  PRs, so it shows no `Could not read PRs` line.
