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
   and record the `terminal` and `tab` it prints.
6. Click another space in the sidebar, so the new space's tab is not shown. Run
   `bun run sandbox status` and check that its `tab` is not the `tab` you saved, so the new space's
   tab stays hidden.
7. Send the blocked report to the saved terminal:
   `bun run sandbox hc send <terminal> "exec sh -c 'printf %b \"\$1\"; read line; printf %b \"\$2\"; exec sleep 86400' qa '\033]7501;state=blocked:app=pi:kind=permission\033\\\\' '\033]7501;state=working:app=pi\033\\\\'"`
8. Take a `shot` of the ask card, and run `bun run sandbox status`: `overlays` holds no
   `koja-toast`, and the status prints no error.
9. Send a line to the first terminal, so it reports working:
   `bun run sandbox hc send --force <terminal> next`. The card closes on a 500 ms host tick, so
   repeat `bun run sandbox status` until `overlays` no longer holds `koja-asks`, for at most 10
   seconds. Only then take a `shot`: the ask card is gone, and `overlays` holds no `koja-toast`.
10. Create a second space on the fixture folder, record its `terminal` and `tab`, and click another
    space so its tab stays hidden. Label its terminal as a worker:
    `bun run sandbox hc label "$terminal" tau.role=worker`
11. Send the blocked report to the worker terminal, as in step 7. Take a `shot`: the toast shows and
    no card shows.
12. Click the worker's toast, and run `bun run sandbox status`: `overlays` no longer holds
    `koja-toast`.
13. Create a third space on the fixture folder, record its `terminal` and `tab`, and click another
    space so its tab stays hidden. Send a report that works and then idles:
    `bun run sandbox hc send <terminal> "exec sh -c 'printf %b \"\$1\"; sleep 2; printf %b \"\$2\"; exec sleep 86400' qa '\033]7501;state=working:app=pi\033\\\\' '\033]7501;state=idle:app=pi\033\\\\'"`
14. Take a `shot` after the second report: the finished toast shows.

## Observable results

- The gallery's `Post a notification` button posts a notification that draws through `koja-toast`.
- `overlays` in `bun run sandbox status` holds `koja-toast` while the notification shows.
- A zoomed `shot` of the toast shows rounded corners, with no square corner outside the curved
  border.
- A click runs the notification's action, so a blocked agent's tab is focused and shown.
- After the click, `overlays` no longer holds `koja-toast`.
- An agent that reports `state=blocked:kind=permission` in a tab not shown shows Koja's ask card and
  no toast. `overlays` in `bun run sandbox status` holds no `koja-toast`, and the status prints no
  error.
- After the first ask is ended, its card is gone and `overlays` holds no `koja-toast`.
- An agent that reports working and then idle in a tab not shown still shows the finished toast.
- A top-level terminal labeled `tau.role=worker` that reports blocked in a tab not shown shows a
  toast and no card.
- A click on the worker's toast removes `koja-toast` from `overlays`.

## End state

The tester names the notification that showed and the action its click ran.

## Gotchas

- The gallery's notification closes by itself after about 4 seconds, so take the shot and read
  `status` at once.
- Herdr posts no toast while the agent's tab is shown, so keep the new space hidden before step 7.
- The machine-login toast needs a real machine. The gallery's login sample shows its `Copy` button,
  but the sample runs no command.
