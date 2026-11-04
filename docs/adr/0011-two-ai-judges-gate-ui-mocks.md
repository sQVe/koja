# ADR 0011: Two AI judges from different model families gate UI mocks

**Date**: 2026-11-04\
**Status**: Accepted\
**Related**: [Judge skill](../../.pi/skills/judge-mock/SKILL.md)

## Context

Koja's UI is designed in mocks before it is built. Each mock needs a fixed way to decide whether it
is good enough. Without one, the result depends on taste in the moment, and two reviews of the same
mock can disagree.

A scene built from real kit parts shows the visual and clarity parts of a design. It cannot show how
the real mod handles the keyboard, a narrow window, or an error. Those parts need the real mod in
the part's last slice.

Some faults are easier to check than to judge. Contrast, sizes, and color values are examples. Model
judges read these values poorly, so `bun run check` tests them before any judge runs.

Model judges also agree with people less on small differences, so one judge's view of a minor issue
is not reliable on its own. One lenient judge could pass a weak mock.

## Decision

Mocks are scenes built from real kit parts with fake data, and two AI judges from different model
families gate them. A mock passes only when `bun run check` passes, and neither judge reports a
finding of severity 2 or higher or an open hard failure.

The judges are `openai/gpt-6.1-sol` and `claude-opus-5-5`. They come from different model families,
so they share fewer blind spots. Each judge works alone and does not see the other judge's answer. A
project skill runs each round and holds the procedure, so the procedure can change without code.

### Mocks

- A scene uses the kit's real parts and fake data. It lives in the committed `koja-mocks` mod.
- The sandbox opens each scene. The scene is captured as a full shot and a crop.
- The judges see the shot, the crop, and the `bun run check` result.

### Findings

- Each judge gives findings only, with no scores.
- Each finding has a severity from 0 to 4 on Nielsen's scale, and it names one category.
- A finding of severity 2 or higher fails the mock. Severity 0 and 1 findings do not.
- Missing evidence does not fail the mock. When a judge cannot decide, it answers `needs evidence`,
  and the session supplies what it lacked and judges again, so a gap in the packet leads to a better
  packet, not a failed mock. Missing evidence listed beside a pass or fail, such as states a still
  image cannot show, starts no new round.

### Categories

- A scene is judged on the first eight categories: visual hierarchy, typography, spacing, and
  density, visual consistency, polish, information architecture, discoverability and affordances,
  feedback and state visibility, and task fit.
- The real mod is judged on all twelve. The four usability categories are efficiency, control and
  error recovery, accessibility and input, and adaptability. They are judged only on the real mod,
  in each part's last slice, because a scene cannot show them.

### Hard failures

A hard failure fails the mock on its own, whatever the findings. There are five kinds:

- `contrast`: text below 4.5:1 or a status mark below 3:1 against a surface it draws on. It comes
  from `bun run check`. State fills, such as hover, selected, raised, and the active toggle fill,
  are not checked, and neither is the decorative ring of a space with no agent. The check lists the
  theme's current failing pairs as known failures, which pass until a theme change fixes them. A new
  failing pair, or a listed pair that starts to pass, fails the check.
- `offKitValue`: a size, radius, text size, or color that is not from the kit or a Herdr theme
  token. It comes from `bun run check`.
- `hiddenTaskInformation`: information the task needs is hidden or absent. The judges flag it.
- `unclearFocusOrMode`: the user cannot tell which pane has focus or which mode is active. The
  judges flag it.
- `unreadableText`: required text cannot be read at the native display scale. The judges flag it.

### Smoke test

Four smoke scenes in `koja-mocks` (`smoke-1` to `smoke-4`) check the procedure. The skill lists the
verdict each one must give. Changing a judge model or the judge instructions requires a smoke test
run.

## Consequences

### Positive

- Two model families share fewer blind spots than two runs of one model.
- One lenient judge cannot pass a mock.
- Each finding names a location and a fix, so a judge says what to change.
- `bun run check` stops clear faults before any model runs.

### Negative

- Each mock costs two frontier-model runs per round.
- A model update can change findings, so the smoke test must run again.
- A scene cannot show the four usability categories. They wait for the real mod in the part's last
  slice.
- The `koja-mocks` mod must follow kit changes, or its scenes show old parts.
- The pass rule is strict. One severity 2 finding from either judge fails the mock.

## Alternatives considered

### One judge

Use a single model judge. Rejected because one model family shares its blind spots, and one judge's
leniency or harshness would decide the result.

### Category scores with a 9.0 pass line

Each judge scores each category from 0 to 10, and each category passes at 9.0. Rejected because a
score near the pass line is not reliable on its own, as the context explains. Findings name the
defect and its fix, so they decide the verdict.

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
error, or a narrow window, so the judges would guess at those findings.
