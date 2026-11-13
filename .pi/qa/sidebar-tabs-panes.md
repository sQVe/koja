# QA recipe: sidebar, tabs, and panes

Drive the spaces sidebar, the tab strip, the pane headers, and their menus in the sandbox the brief
names. Follow [the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point | How to use it                                                   |
| ----------- | --------------------------------------------------------------- |
| Sidebar     | A click or a drag on a space row, and a click on a project name |
| Tab strip   | A click or a drag on a tab, and a click on the plus button      |
| Menus       | A right click on a space or a tab. Button 3 is the right button |

## Driving steps

1. Run `bun run sandbox shot <file>` and read each coordinate from the image.
2. Use one entry point. `bun run sandbox` alone prints the arguments of each input command.
3. Take a `shot` after each step that should change the screen.

## Observable results

- The sidebar lists every space under the name of its project, one line per space: its mark and its
  title. A space row shows no PR number and no branch.
- A click selects a space with the gray fill. A hovered row shows a 1 px outline.
- A click on a project name folds the project to its active spaces and the spaces that need the
  user, and shows `N more`. A second click opens it again.
- A new space shows under its project.
- A drag changes the order, and `s j` follows the new order.
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
