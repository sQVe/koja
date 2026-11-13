# Triage the spaces that need you

## Who

A developer choosing a space in the sidebar.

## Goal

Read the space titles and agent marks without branch or PR details, then choose a space.

## Test

By hand, because the sidebar and a space switch need the running sandbox window. Use the journey
fixture from [Before a launch](../../qa.md#before-a-launch) and follow the
[shared rules](../../qa.md#rules-for-every-section).

## Steps

1. Take a shot of the sidebar. Under `pr-fixture`, each of the two spaces shows one line with a
   hollow agent mark and the title `pr-fixture`. Neither row shows a PR number or `fixture-branch`.
   Click the unselected space row using coordinates from that shot, then take another shot. The
   selected highlight moves to that row. Both rows keep their titles and hollow marks.

## End state

The chosen space is highlighted. Both space rows remain one line, with no PR number or branch.
