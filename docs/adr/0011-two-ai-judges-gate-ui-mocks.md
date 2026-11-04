# ADR 0011: Two AI judges from different model families gate UI mocks

**Date**: 2026-11-04\
**Status**: Accepted\
**Related**: [Judge rubric](../../eval/rubric.md)

## Context

Koja's UI is designed in mocks before it is built. Each mock needs a fixed way to decide whether it
is good enough. Without one, the result depends on taste in the moment, and two reviews of the same
mock can disagree.

A scene built from real kit parts shows the visual and clarity parts of a design. It cannot show how
the real mod handles the keyboard, a narrow window, or an error. Those parts need the real mod in
the part's last slice.

Some faults are easier to check than to judge. Contrast, sizes, and color values are examples. Model
judges read these values poorly, so `bun run check` tests them before any judge runs.

Model judges also agree with people less on small differences. A score near the pass line is
therefore not reliable on its own, and one lenient judge could pass a weak mock.

## Decision

Mocks are scenes built from real kit parts with fake data, and two AI judges from different model
families gate them. A mock passes only when `bun run check` passes, both judges pass every scored
category, and no hard failure is open.

The judges are `openai/gpt-6.1-sol` and `claude-opus-5-5`. They come from different model families,
so they share fewer blind spots. Each judge works alone and does not see the other judge's answer.

### Mocks

- A scene uses the kit's real parts and fake data. It lives in the committed `koja-mocks` mod.
- The sandbox opens each scene. The scene is captured as a full shot and a crop.
- The judges see the shot, the crop, and the `bun run check` result.

### Scores

- Each judge scores each category from 0 to 10, decimals allowed. A category passes at 9.0 or more.
- Each finding has a severity from 0 to 4 on Nielsen's scale, and it names one category.
- An open severity 3 or 4 finding keeps its category below 8.0.
- An open severity 2 finding keeps its category below 9.0.
- A score of 9.0 allows at most two severity 1 findings. A score of 9.5 allows one. A score of 10
  allows none. Severity 0 findings never limit a score.
- A script rejects an answer whose scores break these rules.
- Missing evidence does not fail the gate. The judge lists what it lacked, and the session supplies
  it and judges again, so a gap in the packet leads to a better packet, not a failed mock.

### Categories

- A scene scores the first eight categories: visual hierarchy, typography, spacing, and density,
  visual consistency, polish, information architecture, discoverability and affordances, feedback
  and state visibility, and task fit.
- The real mod scores all twelve. The four usability categories are efficiency, control and error
  recovery, accessibility and input, and adaptability. They are scored only on the real mod, in each
  part's last slice, because a scene cannot show them.

### Hard failures

A hard failure fails the mock on its own, whatever its scores. There are five kinds:

- `contrast`: text or control contrast below WCAG 2.2 AA. It comes from `bun run check`.
- `offKitValue`: a size, radius, text size, or color that is not from the kit or a Herdr theme
  token. It comes from `bun run check`.
- `hiddenTaskInformation`: information the task needs is hidden or absent. The judges flag it.
- `unclearFocusOrMode`: the user cannot tell which pane has focus or which mode is active. The
  judges flag it.
- `unreadableText`: required text cannot be read at the native display scale. The judges flag it.

### Calibration

Changing a judge model, the rubric, or the judge brief requires a new calibration against the user's
labels. Until that calibration runs, the gate is not trusted.

## Consequences

### Positive

- Two model families share fewer blind spots than two runs of one model.
- One lenient judge cannot pass a mock.
- A pass line of 9.0 lets a good mock pass. A gate of 10 would almost never pass.
- Each score ties to findings, so a judge says what to fix.
- `bun run check` stops clear faults before any model runs.

### Negative

- Each mock costs two frontier-model runs per round.
- A model update can change scores, so calibration must run again.
- A scene cannot show the four usability categories. They wait for the real mod in the part's last
  slice.
- The `koja-mocks` mod must follow kit changes, or its scenes show old parts.
- The score rules are strict. A judge must list findings to justify a high score.

## Alternatives considered

### One judge

Use a single model judge. Rejected because one model family shares its blind spots, and one judge's
leniency or harshness would decide the result.

### An average or overall score

Average the category scores and pass at one threshold. Rejected because a high average can hide one
weak category, such as contrast or task fit. Each category must pass on its own.

### A gate of 10

Require every category at 10.0. Rejected because almost no mock would pass, so the gate would not
separate good work from weak work.

### Free scores not tied to findings

Let judges give scores without listing findings. Rejected because a score alone does not say what to
fix, and judges disagree more on bare numbers.

### Pairwise A/B judging as the gate

Ask judges which of two mocks is better. Rejected because the gate asks whether one mock is good
enough, not which of two is better. Judges can also favor the option they see first.

### HTML mocks with generated kit CSS

Write each mock as an HTML page, styled with CSS generated from the kit's values. Rejected because
generated CSS stops wrong values but not wrong parts. An HTML sample that used only generated kit
values still drew rows and a button with the wrong radius, and status dots at an icon size. A CSS
copy of each kit part would be a second kit that drifts from the real one.

### Judges check contrast and kit values

Let the judges flag contrast and off-kit values from the image. Rejected because model judges read
low-level values such as contrast ratios, sizes, and colors poorly, while a test computes them
exactly from the code and the theme file.

### Score usability on scenes

Score efficiency, control and error recovery, accessibility and input, and adaptability on the
scenes too. Rejected because a scene with fake data cannot show keyboard use, recovery from an
error, or a narrow window, so the judges would guess those scores.
