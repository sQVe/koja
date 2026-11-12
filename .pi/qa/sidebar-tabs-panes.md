# QA recipe: sidebar, tabs, and panes

Drive the spaces sidebar, the tab strip, the pane headers, and their menus in the sandbox the brief
names. Follow [the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point | How to use it                                                   |
| ----------- | --------------------------------------------------------------- |
| Sidebar     | A click or a drag on a space row                                |
| Tab strip   | A click or a drag on a tab, and a click on the plus button      |
| Menus       | A right click on a space or a tab. Button 3 is the right button |

## Driving steps

1. Run `bun run sandbox shot <file>` and read each coordinate from the image.
2. Use one entry point. `bun run sandbox` alone prints the arguments of each input command.
3. Take a `shot` after each step that should change the screen.

## Observable results

- The sidebar lists every space.
- A click selects a space.
- A drag changes the order, and `s j` follows the new order.
- The tab strip shows the tabs of the selected space.
- A click selects a tab, a drag reorders the tabs, and the plus button opens the New menu.
- Each pane has a header with its label, and the focused pane has the accent border.
- A right click on a space or a tab opens a menu for that item, not for the focused one.
- The New menu lists terminal, agent, space, and worktree choices.

## Gotchas

- Read the New menu. Launch nothing from it.
- Agent launch, agent status, machines, and pull request rows are not testable. They need real
  agents, SSH, and GitHub.
