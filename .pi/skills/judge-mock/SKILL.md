---
name: judge-mock
description:
  Judge one Koja UI mock scene, or the real mod in a part's last slice, with two AI judges and the
  score gate. Use when a mock or a mod slice needs a pass or fail decision on its look, clarity, or
  task fit, or when the user asks to judge, review, or gate a mock.
---

# Judge a mock

Two AI judges score one mock. `bun run eval:gate` decides pass or fail. The judges read `rubric.md`
and a filled copy of `brief.md`, both in this folder.

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

4. For scope `scene`, read the shot's pixel size (`shot`) and `crop.geometry` (`<w>x<h>+<x>+<y>`)
   from `.tau/judge/<mock>/capture.json`. Record both in section 5 of the brief copy. `<mock>` is
   the scene name from `src/mods/koja-mocks/catalog.ts`.

   For scope `mod`, cut a crop of the mod with ImageMagick. Keep the neighboring edges so alignment
   and grouping show. The shot's pixel coordinates match the window's pixels. Record the shot's
   pixel size and the crop box `<w>x<h>+<x>+<y>` in section 5 of the brief copy.

   ```sh
   magick .tau/judge/<mock>/shot.png -crop <w>x<h>+<x>+<y> .tau/judge/<mock>/crop.png
   ```

5. Copy the brief for this round. Fill its section 2 with the tasks for the part, one line each.
   Leave the skill's own `brief.md` as it is.

   ```sh
   cp .pi/skills/judge-mock/brief.md .tau/judge/<mock>/brief.md
   ```

6. Launch two fresh subagents in the same turn. Use the `subagent` tool with the `scout` profile.
   Give both the same task:
   - Model `openai/gpt-6.1-sol` for one subagent, with answer path `.tau/judge/<mock>/gpt.json`.
   - Model `claude-bridge/claude-opus-5-5` for the other, with answer path
     `.tau/judge/<mock>/opus.json`.

   The task gives these paths and nothing else:
   - `.tau/judge/<mock>/brief.md`, the brief copy from step 5.
   - `.pi/skills/judge-mock/rubric.md`.
   - `.tau/judge/<mock>/shot.png`, the full shot.
   - `.tau/judge/<mock>/crop.png`, the crop.
   - `.tau/judge/<mock>/check.txt`, the check output.
   - The scope, `scene` or `mod`, and the answer path.

   The task tells the subagent to follow the brief, to write its answer JSON to its answer path with
   no other text in the file, and to name that path in its report. The answer's `judge` field must
   be `openai/gpt-6.1-sol` or `claude-opus-5-5`. The `claude-bridge/` route is not a valid value.

7. Run the gate on both answers:

   ```sh
   bun run eval:gate .tau/judge/<mock>/gpt.json .tau/judge/<mock>/opus.json
   ```

   Exit code 0 prints `pass`. Exit code 1 prints either the error of a bad answer file, or `fail`
   with each failing judge and category, and any hard failure. The gate does not print findings or
   `missingEvidence`, so read both in each JSON file.

8. If either answer lists `missingEvidence`, add that evidence to the packet, launch two fresh
   judges as in step 6, and run the gate again before reporting.

9. Report the result:
   - On `pass`, report pass.
   - On `fail`, report each failing judge and category, then the findings to fix.

10. After the mock changes, start a new round at step 1 with a new shot and crop. In a later round,
    check which earlier findings are fixed. Do this check yourself, in the session, and do not tell
    the judges.

## Rules

- Never show a judge the other judge's answer, an earlier score, or an earlier finding.
- Use fresh subagents for every round. Do not reuse a judge's earlier answer.
- Do not edit `rubric.md` or the answer format in a round.
- Do not edit an answer JSON by hand. If a file is invalid, have that judge answer again in a fresh
  subagent.
