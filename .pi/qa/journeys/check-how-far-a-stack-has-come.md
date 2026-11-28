# Check how far a stack has come

## Who

A developer with a stack of pull requests in one space.

## Goal

See what the stack needs from them without opening GitHub.

## Test

By hand, because a tooltip needs the running sandbox window. The manager prepares the stack fixture
under [its own page](../fixtures/stack.md). Follow the
[shared rules](../../qa.md#rules-for-every-section). Walk this journey before
[Find the space that holds a pull request](find-the-space-that-holds-a-pull-request.md), which
switches away from `unrelated`.

## Steps

1. Start with the `unrelated` space selected. Take a shot of the sidebar. The row under the
   `stack-repo` header reads `Fixture PR 505`, shows the bar and `1/3` before its icon, and ends
   with one red circle-x icon and no green merge icon. `unrelated` shows no count. Move the pointer
   onto that icon with `bun run sandbox move <x0> <y0> <x> <y>`, using the icon's coordinates from
   the shot for the end point, then take another shot. A tooltip reads `CI failing`.
2. Click the `Fixture PR 505` row and take a shot. Below the list, the footer shows
   `Fixture PR 505`, the bar, `1/3 merged`, and the underlined `#505`, with no `Stack ›`. The
   fixture has no tracker, so no ticket link shows. Click `unrelated`. The footer shows `unrelated`
   alone, with no bar and no links.
3. Rest the pointer on the `Fixture PR 505` row with `bun run sandbox move`, wait 1 s, and take a
   shot. The card shows the title `Fixture PR 505` and `stack-repo`, the merged line `#504` with
   `1 merged`, `#503` with the red circle-x icon, `#505` with the branch icon and the green merge
   icon, and the footer `3 PRs`. Switch to Inbox, rest the pointer on the same row, and see the same
   card. Switch back to Projects.

## End state

The sidebar is unchanged and `unrelated` is still selected.
