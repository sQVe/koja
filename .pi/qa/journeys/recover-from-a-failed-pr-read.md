# Recover from a failed PR read

## Who

A developer whose project's PR read failed.

## Goal

Clear the failed-read line with Retry while keeping the space titles and agent marks.

## Test

By hand, because the sandbox must show a failed PR read and its recovery. The manager prepares the
fake `gh` and fixture repository under [Before a launch](../../qa.md#before-a-launch). Follow the
[shared rules](../../qa.md#rules-for-every-section). Use no real repository or GitHub login.

## Steps

1. Take a shot after the fixture opens. Under the `pr-fixture` project heading, `Could not read PRs`
   appears with `Retry`. Both space rows still show their `pr-fixture` titles and hollow agent marks
   on one line. Neither row shows a PR number or branch.
2. Restore the fixture read by running `touch /var/tmp/ruta-<name>/home/pr-read-ok` in the host
   shell, using the sandbox name from the brief. This is the only fixture write for the worker. Take
   a fresh shot, then click `Retry` using its coordinates. Wait for the error line to vanish and
   take a shot. Both titles and hollow marks remain unchanged, and the same space stays selected.

## End state

The project has no `Could not read PRs` line or `Retry` button. Both space rows retain their titles
and hollow agent marks.
