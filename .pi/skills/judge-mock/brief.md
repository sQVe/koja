# Judge brief (version 1)

This packet goes to both judges. Both judges get the same packet in the same order and work alone.

The packet holds this brief, `rubric.md`, the scene shot and its crop (section 5), and the
`bun run check` result (section 6). Include the rubric file exactly as it is. Do not edit it, and do
not summarize it here.

## 1. Scope and evidence limits

- Name the component, the states shown, the input mode, and the kit revision.
- Say what is outside scope. A scene does not prove keyboard behavior, recovery, or resizing. The
  real mod in the part's last slice does.
- The judge reviews the artifact, not the designer's intention.
- The scene shot is the authoritative image. The crop is for detail. Record the shot's pixel size
  and the crop's box in shot pixels.
- A failing `bun run check` result is never overruled by an opinion that it looks acceptable.
- Unknown details stay unknown. Ask for better evidence instead of guessing.
- Scope `scene` scores the first eight categories. The last four are listed in `notAssessed`.
- Scope `mod` scores all twelve categories.

## 2. Tasks for this part

The session fills this placeholder with the tasks for the part under review. Write short tasks, one
line each. Examples:

- Sidebar: find the space needing attention, name its repository, read PR and check status, and
  identify the selected space.
- Tab bar: identify the selected tab and the active work area.
- Side panel: find the changed files and the action for them.
- Popup or picker: understand its purpose, its current selection, and the visible exit route.

## 3. Rubric

Included as is: `rubric.md`. Do not restate it in this brief.

## 4. Kit rules

These rules come from ADR 0007 and ADR 0009. They are rules, not preferences.

- The kit owns every size, corner radius, and text size. Mods use the kit's named values.
- The kit draws every status mark and every list row. A mod never draws its own.
- Colors come from Herdr's theme tokens. The kit holds no color values.
- Koja uses one flat base color for the whole window: the frame, panes, terminals, sidebar, and tab
  bar. Panes and the side panel are rounded cards with a faint `selected` outline.
- Focus shows as the `accent` border and a brighter header: the focused pane's title is `foreground`
  and its icon is `muted`; other panes use `muted` and `dim`. Koja adds no other focus mark.
- Tabs, the panel switcher, and the kit's toggle and icon buttons are pills. Inset list rows, such
  as sidebar rows, menu rows, and picker rows, also round with `radius.pill` (6 px).
- A sidebar space with no agent shows a hollow ring in the `border` color. Rows outside the sidebar,
  such as tabs and picker rows, keep an empty slot.
- Popups keep Herdr's overlay frame on the `popover` color. Koja's popup content rounds to the
  frame's radius with `radius.dialog` (8 px). The picker list rounds only its own two outer corners.
- Mod text uses Geist. Terminals keep their own monospace font.
- Text sizes are 9, 11, 13, and 15 px.
- Row heights are 24, 26, and 28 px.
- Spacing values are 0, 1, 2, 4, 6, 8, 10, 14, and 20 px.
- Status mark sizes are a 12 px slot, a 6 px dot, and a 4 px quiet dot.
- Do not add shadows, sizes, focus marks, or card shapes that the kit does not define.

## 5. Scene shot and crop

The session attaches the images with this section. Provide:

- The scene shot at full native resolution. It is the authoritative image.
- One crop of the scene in native resolution, with its box in shot pixels. A crop must keep enough
  neighboring edges to show alignment and grouping.
- The same crop rules for both judges.
- No lossy compression and no change of aspect ratio.

Do not judge density from an enlarged crop alone. A zoom shows pixels; it does not prove readability
at the native scale. If the crop and the shot disagree, the shot decides.

## 6. `bun run check` result

The session attaches the output of `bun run check` for the mod that holds the scene. Give the same
result to both judges. A mock is judged only when this check passes, so a judge always sees a
passing result.

The result covers typechecking, lint, formatting, Knip, and tests. Its color, theme contrast, and
size tests cover `contrast` and `offKitValue`. The judges report the other three hard failure kinds.

## 7. Bias rules

- Hide previous scores, other judges' findings, the iteration number, authorship, and designer
  rationale. The judge searches for defects alone.
- Do not say a candidate was selected or improved.
- Do not present a contact sheet and ask for a precise score for every mock. Review one candidate at
  a time.
- A failing `bun run check` result is never overruled by a model opinion.
- Fix the model identifiers, the packet, and the image settings. Record any setting you cannot get.
- Do not rerun a failing candidate until it passes. An order-dependent comparison is inconclusive.

## 8. Answer format

Write one JSON object. Field rules:

| Field                                | Rule                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `version`                            | Always `1`.                                                                                                                 |
| `judge`                              | `openai/gpt-6.1-sol` or `claude-opus-5-5`.                                                                                  |
| `mock`                               | The mock name.                                                                                                              |
| `scope`                              | `scene` or `mod`.                                                                                                           |
| `categories`                         | One entry per scored category. `scene` scores the first eight; `mod` scores all twelve.                                     |
| `categories.<id>.subchecks`          | The rubric subcheck text, a `result`, and short evidence.                                                                   |
| `categories.<id>.subchecks[].result` | `yes`, `no`, `notApplicable`, or `notObservable`.                                                                           |
| `categories.<id>.score`              | A number from 0 to 10. Decimals are allowed.                                                                                |
| `categories.<id>.reason`             | Why this score, and not the next anchor up or down.                                                                         |
| `notAssessed`                        | For `scene`, exactly `efficiency`, `controlAndRecovery`, `accessibilityAndInput`, `adaptability`. For `mod`, an empty list. |
| `findings`                           | One object per finding: `id`, `category`, `severity`, `location`, `evidence`, `task`.                                       |
| `findings[].severity`                | A whole number from 0 to 4.                                                                                                 |
| `hardFailures`                       | One object per hard failure: `kind`, `location`, `evidence`.                                                                |
| `hardFailures[].kind`                | `contrast`, `hiddenTaskInformation`, `unclearFocusOrMode`, `offKitValue`, or `unreadableText`.                              |
| `missingEvidence`                    | What the judge needed and did not get. It does not change the gate.                                                         |

One complete example answer:

```json
{
  "version": 1,
  "judge": "openai/gpt-6.1-sol",
  "mock": "sidebar-a",
  "scope": "scene",
  "categories": {
    "visualHierarchy": {
      "subchecks": [
        {
          "check": "Do pane titles and section headers read before secondary metadata?",
          "result": "yes",
          "evidence": "Pane titles use the 15 px text size; PR status uses 11 px."
        }
      ],
      "score": 9.5,
      "reason": "F1 is one severity 1 finding, so this is 9.5 and not 10.0; no severity 2 or higher finding is open."
    },
    "typeSpacingDensity": {
      "subchecks": [
        {
          "check": "Do primary labels, secondary metadata, and headings use different roles?",
          "result": "yes",
          "evidence": "Sidebar titles use 13 px; repository names use 11 px."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "consistency": {
      "subchecks": [
        {
          "check": "Do panes and the side panel use the same card shape and radius?",
          "result": "yes",
          "evidence": "Both use the kit's card radius."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "polish": {
      "subchecks": [
        {
          "check": "Are popup corners clean against Herdr's overlay frame?",
          "result": "yes",
          "evidence": "Popup content rounds inside the frame."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "informationArchitecture": {
      "subchecks": [
        {
          "check": "Can the user find the space that needs attention?",
          "result": "yes",
          "evidence": "The sidebar lists spaces by repository."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "affordances": {
      "subchecks": [
        {
          "check": "Do buttons, tabs, and rows look clickable?",
          "result": "yes",
          "evidence": "Tabs are pills; rows highlight on hover."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "stateVisibility": {
      "subchecks": [
        {
          "check": "Does the focused pane show a brighter header and an accent border?",
          "result": "yes",
          "evidence": "The focused pane uses the accent border and a foreground title."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    },
    "taskFit": {
      "subchecks": [
        {
          "check": "Can the user find the space needing attention without opening another view?",
          "result": "yes",
          "evidence": "The sidebar shows space names and status marks."
        }
      ],
      "score": 10.0,
      "reason": "No finding of severity 1 or higher is open, so this is 10.0."
    }
  },
  "notAssessed": ["efficiency", "controlAndRecovery", "accessibilityAndInput", "adaptability"],
  "findings": [
    {
      "id": "F1",
      "category": "visualHierarchy",
      "severity": 1,
      "location": "sidebar row 3, space name",
      "evidence": "The space name sits 1 px above the row's label baseline.",
      "task": "Reading the space name in the sidebar."
    }
  ],
  "hardFailures": [],
  "missingEvidence": []
}
```
