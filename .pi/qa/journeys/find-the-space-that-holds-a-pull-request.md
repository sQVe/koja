# Find the space that holds a pull request

## Who

A developer looking for the space whose stack holds a pull request, by its number.

## Goal

Find that space in the picker by the number of a pull request in its stack, then switch to it.

## Test

By hand, because the picker overlay and a space switch need the running sandbox window. The manager
prepares the stack fixture under [Before a launch](../../qa.md#stack-fixture). Follow the
[shared rules](../../qa.md#rules-for-every-section).

## Steps

1. Start with the `unrelated` space selected. Take a shot before typing. In normal mode, press
   `g p`, then type `504`. Take another shot. The picker lists `stack-space` and not `unrelated`,
   and the right end of that row reads `#504 · PR 2 of 3 · merged` with a work icon after it.
2. Take a shot, then press `Enter`. Take a shot of the sidebar. `stack-space` is the selected space,
   and the picker is closed.

## End state

The `stack-space` space is the active space, and the picker is closed.
