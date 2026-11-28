# Notifications

Target: sandbox

Drive a notification in the sandbox the brief names. Follow
[the rules for every section](../../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point   | Command                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Gallery       | The palette entry `Kit gallery`, then its `Post a notification` button     |
| Blocked agent | The `state=blocked` fixture in [the QA guide](../../qa.md#before-a-launch) |

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. Run the palette entry `Kit gallery`, scroll to `Toasts`, and press `Post a notification`.
3. Take a `shot` of the toast, and run `bun run sandbox status` to see `koja-toast` in `overlays`.
4. Click the toast, and run `bun run sandbox status` again.
5. Create a space on a fixture folder with `bun run sandbox do space.new --folder <fixture folder>`,
   and record the `terminal` it prints.
6. Click another space in the sidebar, so the new space's tab is not shown. Run
   `bun run sandbox status` and check that `focus` names the other space's terminal, not the saved
   one.
7. Send the blocked report to the saved terminal:
   `bun run sandbox hc send <terminal> "exec sh -c 'printf %b \"\$1\"; exec sleep 86400' qa '\033]7501;state=blocked:app=pi:kind=question\033\\\\'"`
8. Take a `shot` of the toast, and run `bun run sandbox status` to see `koja-toast` in `overlays`.
9. Click the toast, and run `bun run sandbox status` again.

## Observable results

- The gallery's `Post a notification` button posts a notification that draws through `koja-toast`.
- `overlays` in `bun run sandbox status` holds `koja-toast` while the notification shows.
- A zoomed `shot` of the toast shows rounded corners, with no square corner outside the curved
  border.
- A click runs the notification's action, so a blocked agent's tab is focused and shown.
- After the click, `overlays` no longer holds `koja-toast`.

## End state

The tester names the notification that showed and the action its click ran.

## Gotchas

- The gallery's notification closes by itself after about 4 seconds, so take the shot and read
  `status` at once.
- Herdr posts no toast while the agent's tab is shown, so keep the new space hidden before step 7.
- The machine-login toast needs a real machine. The gallery's login sample shows its `Copy` button,
  but the sample runs no command.
