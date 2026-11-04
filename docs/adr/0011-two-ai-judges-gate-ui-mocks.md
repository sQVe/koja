# ADR 0011: Two AI judges from different model families gate UI mocks

**Date**: 2026-11-04\
**Status**: Accepted\
**Related**: [Judge rubric](../../eval/rubric.md)

## Context

Koja's UI is designed in mocks before it is built. Each mock needs a fixed way to decide whether it
is good enough. Without one, the result depends on taste in the moment, and two reviews of the same
mock can disagree.

A still HTML mock shows the visual and clarity parts of a design. It cannot show how a running build
handles the keyboard, a narrow window, or an error. Those parts need a sandbox build.

Some faults are easier to measure than to judge. Contrast, sizes, and fonts are examples. Model
judges read these values poorly, so a script measures them before any judge runs.

Model judges also agree with people less on small differences. A score near the pass line is
therefore not reliable on its own, and one lenient judge could pass a weak mock.

## Decision

Two AI judges score each mock, and a mock passes only when both judges pass every scored category
and no hard failure is open.

The judges are `openai/gpt-6.1-sol` and `claude-opus-5-5`. They come from different model families,
so they share fewer blind spots. Each judge works alone and does not see the other judge's answer.

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

- A still mock scores the first eight categories: visual hierarchy, typography, spacing, and
  density, visual consistency, polish, information architecture, discoverability and affordances,
  feedback and state visibility, and task fit.
- The sandbox build scores all twelve. The other four are efficiency, control and error recovery,
  accessibility and input, and adaptability.

### Hard failures

A hard failure fails the mock on its own, whatever its scores. There are five kinds:

- `contrast`: text or control contrast below WCAG 2.2 AA.
- `hiddenTaskInformation`: information the task needs is hidden or absent.
- `unclearFocusOrMode`: the user cannot tell which pane has focus or which mode is active.
- `offKitValue`: a size, radius, or text size is not from the kit, or a color is not from a Herdr
  theme token.
- `unreadableText`: required text cannot be read at the native display scale.

The script measures `contrast`, `offKitValue`, and `unreadableText`. The judges report the other
two.

### Calibration

Changing a judge model, the rubric, or the judge brief requires a new calibration against the user's
labels. Until that calibration runs, the gate is not trusted.

## Consequences

### Positive

- Two model families share fewer blind spots than two runs of one model.
- One lenient judge cannot pass a mock.
- A pass line of 9.0 lets a good mock pass. A gate of 10 would almost never pass.
- Each score ties to findings, so a judge says what to fix.
- Script checks stop clear faults before any model runs.

### Negative

- Each mock costs two frontier-model runs per round.
- A model update can change scores, so calibration must run again.
- A still mock cannot show the four build-only categories. They wait for a sandbox build.
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
