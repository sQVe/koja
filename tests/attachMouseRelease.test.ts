import { expect, it, onTestFinished } from 'bun:test';

import { connectAttach } from '../src/client/client.ts';
import { paneId } from '../src/ids.ts';
import { ModeFlag } from '../src/rows/rows.ts';
import { createMouseRouting } from '../src/ui/mouseRouting.ts';
import { placementOf, targetAt, targetNear } from '../src/ui/screenTargets.ts';
import { build, startServer, temporaryDirectory, waitFor } from './serverHarness.ts';

it('delivers a held mouse release after a tab switch removes the pane row cache', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const result = await connectAttach(socketPath, build, { columns: 80, rows: 24 });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const { session } = result;

  onTestFinished(() => {
    session.close();
  });

  session.sendInput(paneId(1), new TextEncoder().encode("printf '\\033[?1002h\\033[?1006h'\n"));

  await waitFor(() => ((session.rowCache(paneId(1))?.modes() ?? 0) & ModeFlag.buttonMouse) !== 0);

  const forwarded: string[] = [];
  const terminal = { columns: 80, rows: 24 };

  const mouse = createMouseRouting(
    {
      mode: () => 'insert',
      snapshot: () => session.getState().snapshot,
      mouseTarget: (x, y, pane) => {
        const placed = placementOf(session.getState().snapshot, terminal);

        return pane === undefined ? targetAt(placed, x, y) : targetNear(placed, pane, x, y);
      },
      paneSize: (pane) =>
        session.getState().snapshot.panes.find((known) => known.id === pane)?.size,
      paneModes: (pane) => session.rowCache(pane)?.modes() ?? 0,
      sendToPane: (pane, bytes) => {
        forwarded.push(`${pane} ${new TextDecoder().decode(bytes)}`);
        session.sendInput(pane, bytes);
      },
      focusedPane: () => paneId(1),
      focusPane: () => Promise.resolve(),
      chromeAt: () => undefined,
      tab: session.focusTab,
    },
    { focusByClick: () => {} },
  );

  expect(mouse.route('\x1b[<0;25;5M')).toBeUndefined();
  expect(forwarded).toEqual(['pane-1 \x1b[<0;5;5M']);

  session.focusTab({ kind: 'create' });
  await waitFor(() => session.getState().snapshot.tabs.length === 2 && !session.tabPending());
  expect(session.getState().snapshot.panes.some((pane) => pane.id === paneId(1))).toBe(true);
  expect(session.rowCache(paneId(1))).toBeUndefined();

  expect(mouse.route('\x1b[<0;25;5m')).toBeUndefined();
  expect(forwarded).toEqual(['pane-1 \x1b[<0;5;5M', 'pane-1 \x1b[<0;5;5m']);
}, 15000);
