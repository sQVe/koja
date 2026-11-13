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

1. Take a shot of the sidebar. Both spaces open the same main checkout. The first one is the
   `pr-fixture` project header, with a hollow agent mark before the name. The second one is the one
   row under it, with a hollow agent mark and the title `pr-fixture`. The header and the row show no
   PR number or `fixture-branch`. Click whichever of the two is not selected, using coordinates from
   that shot, then take another shot. The selected highlight moves to it. The header and the row
   keep their names and hollow marks.

## End state

The chosen space is highlighted. The header and the row each remain one line, with no PR number or
branch.
