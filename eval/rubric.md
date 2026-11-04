# Judge rubric (version 1)

This rubric scores a Koja design. Two judges use it: `openai/gpt-6.1-sol` and `claude-opus-5-5`.
Each judge works alone and gives one answer.

A mock passes only when both judges score every scored category at 9.0 or more, and no judge lists
an open hard failure. Script-measured hard failures stop a mock before any judge runs.

The first eight categories are scored on still mocks and on the sandbox build. The last four are
scored on the sandbox build only. A still answer lists the last four in `notAssessed` and gives them
no score.

Every category has a definition, observable yes/no subchecks, and anchors at 6.0, 8.0, 9.0, and
10.0. Each anchor names the finding severity that produces it.

## Severity (Nielsen's scale)

Severity is an integer from 0 to 4. It is a finding field, not a score. Score and severity stay
separate, and the score rules below hold them consistent.

| Severity | Name          | Meaning                                           |
| -------- | ------------- | ------------------------------------------------- |
| 0        | Not a problem | No usability problem.                             |
| 1        | Cosmetic      | A cosmetic defect. It does not block a task.      |
| 2        | Minor         | A minor problem. It causes an interruption.       |
| 3        | Major         | A major problem. It blocks a core task.           |
| 4        | Catastrophe   | A usability catastrophe. The task cannot be done. |

Severity weighs frequency, impact, and persistence. A still image cannot prove frequency. Mark the
frequency part of a finding as provisional.

## Score rules

Per category, count the findings of that category in the same answer:

- A severity 3 or 4 finding caps the score below 8.0.
- A severity 2 finding caps the score below 9.0.
- A score of 9.0 or more allows at most two severity 1 findings.
- A score of 9.5 or more allows at most one severity 1 finding.
- A score of 10.0 allows no severity 1 finding.
- A severity 0 finding never limits a score.

Severity is not a subtraction formula. Record one cause once, in its primary category. Use
cross-references when one cause touches other categories.

## Scores below the anchors

- 0 to 5: 0 to 2 is unreadable or unusable core presentation; 3 to 5 is multiple major or systemic
  defects.
- 7.0: a clear improvement over the 6.0 anchor, but several minor defects remain.

Scores 8.0 to 8.9 stay below the gate. Scores 9.0 to 9.9 meet it only under the 9.0 conditions.

## Hard failures

An open hard failure blocks the mock, whatever the scores. A hard failure is a kind, not a severity.

| Kind                    | Description                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `contrast`              | Text or control contrast below WCAG 2.2 AA. Text needs 4.5:1; large text needs 3:1. Controls and states need 3:1. |
| `hiddenTaskInformation` | Information the task needs is hidden or absent.                                                                   |
| `unclearFocusOrMode`    | The user cannot tell which pane has focus or which mode is active.                                                |
| `offKitValue`           | A size, radius, or text size is not from the kit (`src/kit/size.ts`), or a color is not from a Herdr theme token. |
| `unreadableText`        | Required text cannot be read at the native display scale.                                                         |

A measured failure is never overruled.

## Categories

### visualHierarchy: Visual hierarchy

Scored on: still mocks and the sandbox build.

Definition: the most important content reads first, and the layout shows what belongs together.

Subchecks:

- Do pane titles and section headers read before secondary metadata?
- Does the selected space or tab stand out from the unselected ones?
- Are related controls grouped so their edges align, such as sidebar rows and the tab bar?
- Does a side panel header read above its list?
- Do popups show their title before their list or body?
- Does one focus mark show which pane is focused?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the focused pane's header is as dim as the unfocused panes,
  so the user cannot see where work happens. Not 8 because this blocks the core task of finding the
  working pane.
- **8.0** (a severity 2 finding remains): sidebar section headers and row labels share one text size
  and color, so the user re-reads to find a section. Not 9 because a minor scan problem remains.
- **9.0** (no severity 2 or higher, at most two severity 1): one pane header sits 1 px off the
  shared baseline, with no reading effect. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): pane titles, sidebar labels, tab labels, and popup titles all
  read in the order the task needs. Means no defect was found in the supplied evidence, not proven
  usability.

### typeSpacingDensity: Typography, spacing, and density

Scored on: still mocks and the sandbox build.

Definition: text roles and grouping are readable and consistent at the intended display scale,
without crowding or waste.

Subchecks:

- Do primary labels, secondary metadata, and headings use different roles?
- Can the user tell a primary label from metadata at the native size?
- Do repeated rows share one vertical rhythm?
- Does spacing separate groups without hiding their relationship?
- Does truncation keep the text the task needs?
- Do the text sizes come from the kit's 9, 11, 13, and 15 px scale?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): two-line sidebar rows crowd the 13 px title and the PR status
  until they collide or vanish. Not 8 because the user cannot read the PR status.
- **8.0** (a severity 2 finding remains): one recurring truncation hides PR status in ordinary rows.
  Not 9 because required secondary text stays hard to read.
- **9.0** (no severity 2 or higher, at most two severity 1): one icon-to-label gap looks uneven,
  with no scanning effect. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): rows use 13 px labels and 11 px metadata on one rhythm, with
  no defect found in the supplied states.

### consistency: Visual consistency

Scored on: still mocks and the sandbox build.

Definition: the same part looks and behaves the same everywhere.

Subchecks:

- Do panes and the side panel use the same card shape and radius?
- Do tabs, the panel switcher, toggle buttons, icon buttons, and inset rows all use the same pill
  radius?
- Do status marks use the kit's slot, dot, and quiet-dot sizes?
- Does popup content round to the frame's radius?
- Do rows outside the sidebar keep an empty mark slot?
- Do focused and unfocused panes use one focus treatment?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the picker's active row uses a different pill and highlight
  from every other list, so the user cannot tell which row will run. Not 8 because the wrong command
  may run.
- **8.0** (a severity 2 finding remains): the side panel is flat with a divider while the panes are
  cards, the rejected direction of ADR 0009. Not 9 because the work areas do not read as one window.
- **9.0** (no severity 2 or higher, at most two severity 1): one row uses `radius.pill` (6 px) but
  its corner pixels differ slightly. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): panes, side panel, tabs, rows, marks, and popup content all
  use one shape language, with no defect found.

### polish: Polish

Scored on: still mocks and the sandbox build.

Definition: the surface is free of visible defects, artifacts, and unfinished parts.

Subchecks:

- Are popup corners clean against Herdr's overlay frame?
- Is text free of clipping and overlap?
- Are stray lines, double borders, or added shadows absent?
- Are icons aligned with their labels?
- Is the shown terminal preview free of stale content and artifacts?
- Are disabled and empty states drawn, not blank?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the side panel's file list paints behind the pane card, so
  the changed files are hidden. Not 8 because the user cannot find the file to act on.
- **8.0** (a severity 2 finding remains): one sidebar row clips a descender in its 13 px title. Not
  9 because a minor visible defect remains.
- **9.0** (no severity 2 or higher, at most two severity 1): one icon sits 1 px off its label's
  centerline, with no reading effect. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): no clipping, corner leak, shadow, or unfinished part was found
  in the supplied states.

### informationArchitecture: Information architecture

Scored on: still mocks and the sandbox build.

Definition: information is grouped and labeled so the task's questions are answered where the user
looks.

Subchecks:

- Can the user find the space that needs attention?
- Can the user identify each space's repository?
- Can the user read PR and check status in the sidebar?
- Can the user tell which space is selected?
- Does a panel show the changed files and the pending action?
- Does a popup state its purpose and current selection?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): PR status is hidden behind the pane list with no label on
  where to find it. Not 8 because a required task answer is missing.
- **8.0** (a severity 2 finding remains): the sidebar folds spaces under counts, and one folded
  group hides the space needing attention. Not 9 because a minor retrieval problem remains.
- **9.0** (no severity 2 or higher, at most two severity 1): one group label is shorter than its
  neighbors, but every task question is answered. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): every task question is answered where the user looks, with no
  defect found.

### affordances: Discoverability and affordances

Scored on: still mocks and the sandbox build.

Definition: controls look like controls, and their result is discoverable.

Subchecks:

- Do buttons, tabs, and rows look clickable?
- Does the selected tab read as selected?
- Does a popup show its exit route?
- Do picker rows show which row is active?
- Does a destructive action look different from a safe one?
- Does an icon button show its purpose on hover or with a label?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the popup has no visible close control and no key hint, so
  the user cannot leave it. Not 8 because a core action is not discoverable.
- **8.0** (a severity 2 finding remains): the picker marks the active row with color alone, so it is
  easy to miss at 13 px. Not 9 because the active row stays hard to spot.
- **9.0** (no severity 2 or higher, at most two severity 1): one icon button's hover highlight is
  fainter than its neighbors', but the button still reads as clickable. Not 10 because that cosmetic
  finding is open.
- **10.0** (no severity 1 or higher): every control in scope shows its action and its current state,
  with no defect found.

### stateVisibility: Feedback and state visibility

Scored on: still mocks and the sandbox build.

Definition: the surface shows what is happening, what is selected, and what changed.

Subchecks:

- Does the focused pane show a brighter header and an accent border?
- Does a running agent show a filled mark and an idle one a quieter mark?
- Does the selected space row read as a pill?
- Does a popup show its current selection?
- Does the pane show which file or task is active?
- Do rows and buttons show a hover or active state?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the sidebar draws no mark for spaces with no agent and no
  idle dot, so states are invisible. Not 8 because the user cannot tell running from idle.
- **8.0** (a severity 2 finding remains): one agent's running state and idle state share the same
  dot color and size. Not 9 because a minor state ambiguity remains.
- **9.0** (no severity 2 or higher, at most two severity 1): the quiet dot's edge looks soft at the
  kit's 4 px quiet-dot size. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): focus, selection, running, idle, and hover states are all
  visible and distinct, with no defect found.

### taskFit: Task fit

Scored on: still mocks and the sandbox build.

Definition: the surface supports the stated task with the information and actions it needs.

Subchecks:

- Can the user find the space needing attention without opening another view?
- Can the user read PR and check status for a space?
- Can the user switch panes from the tab bar?
- Can the user find and act on a changed file in the side panel?
- Can the user choose an item in the picker?
- Is any required action missing from the shown state?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the tab bar hides the tab for the active pane, so the user
  cannot switch back. Not 8 because a core navigation step fails.
- **8.0** (a severity 2 finding remains): the side panel lists files but shows no action for them.
  Not 9 because one required action stays out of reach.
- **9.0** (no severity 2 or higher, at most two severity 1): one secondary label wraps to a second
  line without costing a task step. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): every stated task step can be completed from the shown
  surface, with no defect found.

### efficiency: Efficiency

Scored on: the sandbox build only. A still answer lists this category in `notAssessed`.

Definition: the user reaches the task's result in few steps, without repeated work.

Subchecks:

- Can the user reach the space needing attention in one step?
- Does the tab bar switch panes without opening a menu?
- Does the picker find a row without a full-list scan?
- Does the side panel show changed files without a second click?
- Does a repeated action keep its place between states?
- Are key hints shown for common actions?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the pane switcher's menu opens but takes no input, so the
  user cannot change panes. Not 8 because the core task of switching panes cannot be done.
- **8.0** (a severity 2 finding remains): the picker resets to the top after each selection. Not 9
  because the user repeats the same scroll.
- **9.0** (no severity 2 or higher, at most two severity 1): one rare action has no key hint but
  stays one click away. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): common actions take the fewest steps the task allows, with no
  defect found.

### controlAndRecovery: Control and error recovery

Scored on: the sandbox build only. A still answer lists this category in `notAssessed`.

Definition: the user can undo, cancel, and recover from a mistake.

Subchecks:

- Can the user cancel a popup without acting?
- Does closing a space ask before it discards work?
- Can the user undo the last destructive action?
- Does a failed action show an error and a next step?
- Does the popup keep focus while it is open?
- Can the user retry a failed load?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): closing a space discards unsaved work with no prompt and no
  undo. Not 8 because the mistake loses the user's work.
- **8.0** (a severity 2 finding remains): one dialog has no visible cancel control and exits only on
  Escape. Not 9 because the exit route is hidden.
- **9.0** (no severity 2 or higher, at most two severity 1): one error message is terse but names
  the failed file. Not 10 because that cosmetic finding is open.
- **10.0** (no severity 1 or higher): cancel, undo, and error paths all work and are visible, with
  no defect found.

### accessibilityAndInput: Accessibility and input

Scored on: the sandbox build only. A still answer lists this category in `notAssessed`.

Definition: the surface works with keyboard and other input, and meets WCAG 2.2 AA where the build
allows measurement.

Subchecks:

- Does every interactive control have a visible focus ring?
- Can the user reach each control by keyboard?
- Is text contrast at least 4.5:1, or 3:1 for large text?
- Are control and state contrast at least 3:1?
- Is each pointer target at least 24 by 24 CSS px, or spaced by the AA exception?
- Does every control have an accessible name?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the side panel's file list takes no keyboard focus, so a
  keyboard user cannot open a changed file. Not 8 because a core task cannot be done from the
  keyboard.
- **8.0** (a severity 2 finding remains): one icon button's focus ring is visible but faint. Not 9
  because keyboard users can lose their place.
- **9.0** (no severity 2 or higher, at most two severity 1): one rarely used popup shows its key
  hint only after a pause, while the key itself works at once. Not 10 because that cosmetic finding
  is open.
- **10.0** (no severity 1 or higher): measured contrast, focus, names, and targets pass the AA
  checks in scope, with no defect found.

### adaptability: Adaptability

Scored on: the sandbox build only. A still answer lists this category in `notAssessed`.

Definition: the surface holds up when the window, the content, or the theme changes.

Subchecks:

- Does the layout survive a narrow window?
- Do long labels truncate without hiding the task's text?
- Does a theme change keep contrast and card boundaries?
- Do rows keep alignment when counts grow?
- Do popups stay on screen when the window shrinks?
- Does the pane grid stay usable with many panes?

Anchors, each tied to findings:

- **6.0** (a severity 3 or 4 finding): the side panel disappears below the minimum width with no way
  to reach it. Not 8 because a whole work area is lost.
- **8.0** (a severity 2 finding remains): long space names push PR status out of the sidebar row.
  Not 9 because content loss remains at a common window size.
- **9.0** (no severity 2 or higher, at most two severity 1): one row's ellipsis sits 1 px closer to
  the label than its neighbors, and the label still truncates safely. Not 10 because that cosmetic
  finding is open.
- **10.0** (no severity 1 or higher): narrow windows, long labels, and theme changes keep every
  task's content reachable, with no defect found.
