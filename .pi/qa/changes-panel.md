# QA recipe: Changes panel

Drive the Changes panel mod, `koja-changes`, in the sandbox the brief names. Follow
[the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point    | How to use it                          |
| -------------- | -------------------------------------- |
| Changes button | A click on the button in the tab strip |

## Driving steps

1. Run `bun run sandbox shot <file>` and read each coordinate from the image.
2. Click the Changes button to show the panel.
3. Select the space of each fixture in turn, and take a `shot` of the panel.
4. Click a file in the list, and take a `shot` of its diff.
5. When the brief allows data writes, commit in a fixture repository with changes.

## Observable results

- The Changes button in the tab strip shows and hides the panel.
- Each space keeps its choice after a switch away and back.
- The panel lists the changed files of the focused pane's repository.
- A click on a file shows its diff.
- After a switch to another space, the panel leaves "Loading changes…". It shows that space's files
  or its state line.
- A clean repository shows "No uncommitted changes".
- A folder that is not a repository shows "Not a git repository" with a Retry.
- In a fixture repository with changes, a message and the Commit button make one commit of every
  change. A message and `Return` in the message field do the same.
- After each commit, the message field is empty and the panel shows "No uncommitted changes".

## Gotchas

- Commit stages every change of the focused pane's repository. Never type in the message field or
  press the Commit button outside a fixture repository.
- A commit is a data write. Follow the brief's `Data writes` line.
