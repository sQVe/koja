# Judge instructions

You review one Koja UI mock. The packet holds `context.md`, the shot, the crop, and `check.txt`. The
shot is the authoritative image. The crop shows detail.

## Scope and evidence

- Review the artifact, not the designer's intent. Do not look for or use earlier rounds.
- Review each candidate alone. Search for defects. Do not rank it against other mocks.
- A scene does not show keyboard use, error recovery, or a narrow window. Do not report those for a
  scene.
- Judge density from the shot, not from an enlarged crop alone.
- For a scene, the top row of the crop, with the scene's name and a close button, belongs to the
  mock viewer, not the design. Do not report it. The scene window's size is also the viewer's, so do
  not report empty space below the content.
- Unknown details stay unknown. Name the missing evidence instead of guessing.
- Do not report contrast or off-kit sizes and colors. `bun run check` covers them.

## Kit rules

- The kit owns every size, corner radius, and text size, and it draws every status mark and list
  row.
- Colors come from Herdr's theme tokens. The window uses one flat base color.
- Panes and the side panel are rounded cards with a faint outline.
- Focus shows as the accent border and a brighter header. Other panes use muted text.
- Tabs, toggles, icon buttons, and inset rows are pills.
- A space with no agent shows a hollow ring. Rows outside the sidebar keep an empty mark slot.
- Popups keep Herdr's overlay frame. Popup content rounds to the frame's radius.
- Popups close with Esc and show no close control or Esc hint. Do not report their absence.
- Mod text uses Geist. Terminals keep their own monospace font.
- No shadows, extra focus marks, or card shapes outside the kit.

## Categories

For scope `scene`, judge the first eight categories. For scope `mod`, judge all twelve.

- `visualHierarchy`: Do titles and section headers read before secondary text? Does the selected
  item stand out? Are related rows and controls grouped and aligned?
- `typeSpacingDensity`: Do labels, metadata, and headings use different roles? Do repeated rows keep
  one rhythm? Does truncation keep the text the task needs?
- `consistency`: Do cards, pills, marks, and popup content use one shape language? Do focused and
  unfocused panes use one focus treatment?
- `polish`: Is text free of clipping and overlap? Are stray lines, double borders, and shadows
  absent? Are icons aligned with their labels? Are empty states drawn?
- `informationArchitecture`: Can the user find the space that needs attention? Can the user read
  each space's repository, PR, and check status? Does a popup state its purpose?
- `affordances`: Do buttons, tabs, and rows look clickable? Does the active row show without relying
  on color alone?
- `stateVisibility`: Are focus, selection, running, idle, and hover states visible and distinct?
- `taskFit`: Can each task in `context.md` be finished from the shown surface? Is information the
  task needs hidden or absent?
- `efficiency`: Can the user reach the result in few steps? Do repeated actions keep their place?
  Are key hints shown for common actions?
- `controlAndRecovery`: Can the user cancel without acting? Does a destructive action ask first?
  Does a failed action show a message and a next step?
- `accessibilityAndInput`: Does each control have a visible focus ring and an accessible name? Can
  the keyboard reach each control?
- `adaptability`: Does the layout keep the task's content at a narrow width? Do long labels truncate
  without hiding task text? Does a theme change keep boundaries visible?

## Severity

Use Nielsen's scale for each finding:

- 0: not a problem.
- 1: cosmetic. It does not block a task.
- 2: minor. It causes an interruption.
- 3: major. It blocks a core task.
- 4: catastrophe. The task cannot be done.

A shot cannot prove how often a problem occurs. Mark any frequency claim as provisional.

## Hard failures

Report these kinds only:

- `hiddenTaskInformation`: information the task needs is hidden or absent.
- `unclearFocusOrMode`: the user cannot tell which pane has focus or which mode is active.
- `unreadableText`: required text cannot be read at the native display scale.

## Answer

Write the answer to the path the task names. The file holds only this Markdown, in this order:

1. The first line is exactly one of `Verdict: pass`, `Verdict: fail`, or `Verdict: needs evidence`.
   - Use `fail` when any finding has severity 2 or higher, or any hard failure is open.
   - Use `needs evidence` when no such finding is open and the packet lacks evidence to decide.
   - Otherwise use `pass`.
2. `## Findings`: one entry per finding, with its ID, category, severity, location, evidence, and a
   suggested fix. Write `None.` when there are none.
3. `## Hard failures`: each kind, its location, and its evidence. Write `None.` when there are none.
4. `## Missing evidence`: what you needed and did not get. Write `None.` when there is none.
