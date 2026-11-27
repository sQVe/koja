# Triage the spaces that need you

## Who

A developer choosing a space in the sidebar.

## Goal

Read the space titles and agent marks without branch or PR details, switch to Inbox, and choose the
space that needs you.

## Test

By hand, because the sidebar and a space switch need the running sandbox window. Use the journey
fixture from [Before a launch](../../qa.md#before-a-launch) and follow the
[shared rules](../../qa.md#rules-for-every-section).

## Steps

1. Take a shot of the sidebar. Both spaces open the same main checkout. The first one is the
   `pr-fixture` project header, with an empty mark slot before the name. The second one is the one
   row under it, with the red blocked bubble and the title `pr-fixture`. The header and the row show
   no PR number or `fixture-branch`. Click whichever of the two is not selected, using coordinates
   from that shot, then take another shot. The selected highlight moves to it. The header and the
   row keep their names and marks.
2. Take a shot, then click `Inbox` in the switch above the list, and take another shot. The list
   shows `Agent asks` with the count `1` and the blocked space's row, then `Quiet` with the count
   `1` and the other space's row. No project header shows. Each row shows the dim project name
   `pr-fixture` at its right, and a row that has waited shows its age after the name.
3. Click the row under `Agent asks`, using coordinates from the shot, and take a shot. That space is
   selected and shown, and the sidebar stays in Inbox.

## End state

The blocked space is shown, and the sidebar is in Inbox. The chosen row is highlighted. In Projects,
the header and the row each remain one line, with no PR number or branch.
