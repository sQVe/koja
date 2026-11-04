---
name: judge-mock
description:
  Judge one Koja UI mock scene, or the real mod in a part's last slice, with two AI judges. Use when
  a mock or a mod slice needs a pass or fail decision on its look, clarity, or task fit, or when the
  user asks to judge, review, or gate a mock.
---

# Judge a mock

Two AI judges review one mock and list findings. The session applies the pass rule to their answers.
Judges give no scores.

Use scope `scene` for a mock scene built from kit parts with fake data. Use scope `mod` for the real
mod in a part's last slice.

Keep each round's files in `.tau/judge/<mock>/`. Git ignores that folder.

## Steps

1. Run the check and save its output:

   ```sh
   mkdir -p .tau/judge/<mock>
   bun run check > .tau/judge/<mock>/check.txt 2>&1
   ```

   If the check fails, stop the round. Fix the failures first. No judge can overrule a failing
   check.

2. Start the sandbox:

   ```sh
   bun run sandbox up
   ```

   For scope `mod`, open the mod in the sandbox window with `bun run sandbox click`, `type`, or
   `key`. Use only the sandbox, never the real window. For scope `scene`, do not open the scene:
   step 3 opens it, and fails when a `koja-mocks` overlay is already open.

3. Capture the scene for scope `scene`:

   ```sh
   bun run mock:capture <mock>
   ```

   The command opens the scene in the `koja-mocks` mod and writes `shot.png`, `crop.png`, and
   `capture.json` to `.tau/judge/<mock>/`. The crop is exactly the scene window, and the full shot
   gives the neighboring context.

   For scope `mod`, capture the full window:

   ```sh
   bun run sandbox shot .tau/judge/<mock>/shot.png
   ```

4. For scope `scene`, read the shot's pixel size and `crop.geometry` (`<w>x<h>+<x>+<y>`) from
   `.tau/judge/<mock>/capture.json`.

   For scope `mod`, cut a crop of the mod with ImageMagick. Keep the neighboring edges so alignment
   and grouping show. The crop box uses shot pixels.

   ```sh
   magick .tau/judge/<mock>/shot.png -crop <w>x<h>+<x>+<y> .tau/judge/<mock>/crop.png
   ```

5. Write `.tau/judge/<mock>/context.md` with:
   - The scope, the component name, and the input mode.
   - The shot's pixel size and the crop box in shot pixels.
   - The tasks for the part, one short line each. Write what a user does on the surface, such as
     "Find the command you want."

   Keep every line neutral. Do not name a state, a defect, or an expected result; the judges find
   those in the images.

6. Launch two fresh subagents in the same turn. Use the `subagent` tool with the `scout` profile.
   Give both the same task:
   - Model `openai/gpt-6.1-sol` for one subagent, with answer path `.tau/judge/<mock>/gpt.md`.
   - Model `claude-bridge/claude-opus-5-5` for the other, with answer path
     `.tau/judge/<mock>/opus.md`.

   The task gives these paths and nothing else:
   - `.pi/skills/judge-mock/judge.md`, the judge instructions.
   - `.tau/judge/<mock>/context.md`.
   - `.tau/judge/<mock>/shot.png`, the full shot.
   - `.tau/judge/<mock>/crop.png`, the crop.
   - `.tau/judge/<mock>/check.txt`, the check output.
   - The scope, `scene` or `mod`, and the answer path.

   The task tells the subagent to follow the judge instructions, write its answer to its answer path
   with no other text in the file, and name that path in its report. Never give a judge this
   `SKILL.md`: its Smoke test section holds the expected verdicts.

7. Apply the pass rule to both answers. Read each answer's findings and hard failures in full:

   A mock passes when all three hold:
   - `bun run check` passed in step 1.
   - Neither judge lists a finding of severity 2 or higher.
   - Neither judge lists a hard failure.

   Otherwise the mock fails. A verdict line that disagrees with the rule does not change the result.

8. If either answer has a `needs evidence` verdict, add the evidence it names to the packet, launch
   two fresh judges as in step 6, and apply the pass rule again before you report. Missing evidence
   listed beside a `pass` or `fail` verdict, such as states a still image cannot show, does not
   start a new round.

9. Report the result:
   - On pass, report pass.
   - On fail, report each judge's findings of severity 2 or higher and each hard failure, with the
     location and suggested fix.

10. After the mock changes, start a new round at step 1 with a new shot and crop. In a later round,
    check which earlier findings are fixed. Do this check yourself, in the session, and do not tell
    the judges.

## Rules

- Never show a judge the other judge's answer, an earlier verdict, or an earlier finding.
- Use fresh subagents for every round. Do not reuse a judge's earlier answer.
- Do not edit an answer file by hand. If a file is invalid, have that judge answer again in a fresh
  subagent.
- Do not edit `judge.md` in a round.

## Smoke test

Four palette scenes in `koja-mocks` check this procedure. Run them with
`bun run mock:capture smoke-N` and judge each one as a normal round in `.tau/judge/smoke-N/`. Each
scene must give the expected verdict below. The expected verdicts follow from each scene's design.
They are not results from a judge run.

| Scene     | Expected verdict | Design                                                     |
| --------- | ---------------- | ---------------------------------------------------------- |
| `smoke-1` | fail             | No section header, and no row is selected.                 |
| `smoke-2` | pass             | Clean: a section header, a selected first row, all labels. |
| `smoke-3` | fail             | Every command label is blank.                              |
| `smoke-4` | pass             | One row is smaller than its neighbors.                     |

Run the smoke test again when a judge model, `judge.md`, or what step 6 gives the judges changes.
