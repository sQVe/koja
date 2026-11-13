# QA recipe: sidebar, tabs, and panes

Drive the spaces sidebar, the tab strip, the pane headers, and their menus in the sandbox the brief
names. Follow [the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point | How to use it                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| Sidebar     | A click on a space row or a project header, a drag on a space row, and a chevron |
| Tab strip   | A click or a drag on a tab, and a click on the plus button                       |
| Menus       | A right click on a space, a project header, or a tab. Button 3 is the right one  |

## Driving steps

1. Run `bun run sandbox shot <file>` and read each coordinate from the image.
2. Use one entry point. `bun run sandbox` alone prints the arguments of each input command.
3. Take a `shot` after each step that should change the screen.

## Observable results

- The sidebar lists every space under the name of its project, one line per space: its mark and its
  title. A space row shows no PR number and no branch.
- The main checkout of a Git repository is the project header, not a row. The header shows that
  space's mark and the repository name, and no space row repeats it.
- A click selects a space with the gray fill. A click on a project header selects its main checkout
  the same way. A hovered row or header shows a 1 px outline.
- Hovering a project header that has other spaces shows a chevron at its right end. A click on the
  chevron folds the project to its active spaces and the spaces that need the user, shows `N more`,
  and does not change the selected space. A click on the chevron of a folded project opens it again.
- A project without a main checkout, such as only linked worktrees or a folder outside Git, has a
  name-only header. A click on that name folds the project, and a second click opens it again.
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
- The New menu lists terminal, agent, space, and worktree choices.

## Gotchas

- Read the New menu. Launch nothing from it.
- Agent launch, agent status, remote projects, and pull request titles are not testable. They need
  real agents, SSH, and GitHub. A fixture repository without a remote has no PRs, so it shows no
  `Could not read PRs` line.
