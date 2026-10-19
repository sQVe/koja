import { expect, it } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import { applyIntent, createState, paneTheme, savedSessionOf } from './store.ts';
import type { State, Theme } from './store.ts';
import {
  attachLarge,
  createDocs,
  createKoja,
  defined,
  fact,
  intent,
  noFolders,
  run,
  splitFirst,
  withClient,
} from './storeFixtures.ts';

const lightTheme: Theme = {
  foreground: 0x11_22_33,
  background: 0xdd_ee_ff,
  palette: Array.from({ length: 16 }, (_, index) => index),
};

const darkTheme: Theme = { ...lightTheme, background: 0x00_00_10 };

const attachedState = (): State => run([{ type: 'attachClient', size: { columns: 80, rows: 24 } }]);

it('resizes the pane to the layout size of a client that attaches', () => {
  const state = run([createKoja]);
  const result = intent(state, { type: 'attachClient', size: { columns: 100, rows: 30 } });

  const client = {
    id: clientId(1),
    size: { columns: 100, rows: 30 },
    theme: undefined,
    view: state.defaultView,
  };

  expect(result.state.attachedClientId).toBe(clientId(1));
  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 29 });

  expect(result.changes).toEqual([
    { type: 'clientAttached', client },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 80, rows: 29 } },
  ]);
});

it('takes over from the attached client when a second client attaches', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, { type: 'attachClient', size: { columns: 90, rows: 20 } });

  const client = {
    id: clientId(2),
    size: { columns: 90, rows: 20 },
    theme: undefined,
    view: state.defaultView,
  };

  expect(result.state.attachedClientId).toBe(clientId(2));
  expect(result.state.clients).toEqual([client]);

  expect(result.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'takenOver' },
    { type: 'clientAttached', client },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 70, rows: 19 } },
  ]);
});

it('reports the client size and the pane size when the attached client resizes', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 60, rows: 15 },
  });

  expect(result.state.panes[0]?.size).toEqual({ columns: 40, rows: 14 });

  expect(result.changes).toEqual([
    { type: 'clientResized', clientId: clientId(1), size: { columns: 60, rows: 15 } },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 40, rows: 14 } },
  ]);
});

it('reports a client resize that keeps the pane size, and raises the revision', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 80, rows: 1 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 80, rows: 2 },
  });

  expect(result.state.panes[0]?.size).toEqual(state.panes[0]?.size);

  expect(result.changes).toEqual([
    { type: 'clientResized', clientId: clientId(1), size: { columns: 80, rows: 2 } },
  ]);

  expect(result.state.revision).toBe(state.revision + 1);
});

it('treats a client resize to its current size as no change', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 100, rows: 30 },
  });

  expect(result.changes).toEqual([]);
  expect(result.state.revision).toBe(state.revision);
});

it('refuses to resize an unknown client and leaves state unchanged', () => {
  const state = run([createKoja]);

  const result = applyIntent(state, {
    type: 'resizeClient',
    clientId: clientId(7),
    size: { columns: 60, rows: 15 },
  });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('detaches a client on request and keeps the pane size', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, { type: 'detachClient', clientId: clientId(1) });

  expect(result.state.attachedClientId).toBeUndefined();
  expect(result.state.clients).toEqual([]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 29 });

  expect(result.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'requested' },
  ]);
});

it('refuses to detach an unknown client and leaves state unchanged', () => {
  const state = run([createKoja]);

  const result = applyIntent(state, { type: 'detachClient', clientId: clientId(7) });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('has no pane colors until the attached client reports its theme', () => {
  expect(paneTheme(attachedState())).toBeUndefined();
});

it('uses the theme the attached client reports as the pane colors', () => {
  const result = intent(attachedState(), {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: lightTheme,
  });

  expect(paneTheme(result.state)).toEqual(lightTheme);

  expect(result.changes).toEqual([
    { type: 'clientThemeChanged', clientId: clientId(1), theme: lightTheme },
  ]);

  expect(result.state.revision).toBe(attachedState().revision + 1);
});

it('treats a theme equal to the client theme as no change', () => {
  const themed = intent(attachedState(), {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: lightTheme,
  }).state;

  const result = intent(themed, {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: { ...lightTheme, palette: [...lightTheme.palette] },
  });

  expect(result.changes).toEqual([]);
  expect(result.state).toEqual(themed);
});

it('changes the pane colors when a client with other colors takes over', () => {
  const themed = run([
    { type: 'attachClient', size: { columns: 80, rows: 24 } },
    { type: 'setClientTheme', clientId: clientId(1), theme: lightTheme },
    { type: 'attachClient', size: { columns: 80, rows: 24 } },
  ]);

  expect(paneTheme(themed)).toBeUndefined();

  const result = intent(themed, {
    type: 'setClientTheme',
    clientId: clientId(2),
    theme: darkTheme,
  });

  expect(paneTheme(result.state)).toEqual(darkTheme);

  expect(result.changes).toEqual([
    { type: 'clientThemeChanged', clientId: clientId(2), theme: darkTheme },
  ]);
});

it('refuses a theme from an unknown client and leaves state unchanged', () => {
  const state = attachedState();

  const result = applyIntent(state, {
    type: 'setClientTheme',
    clientId: clientId(9),
    theme: lightTheme,
  });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('resizes every live pane by the layout when the client resizes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 121, rows: 31 },
  });

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 48, rows: 28 },
    { columns: 48, rows: 28 },
  ]);

  expect(result.changes.filter((change) => change.type === 'paneResized')).toHaveLength(2);
});

it('makes a client that attaches the foreground client', () => {
  const first = run([attachLarge]);

  expect(first.foregroundClientId).toBe(clientId(1));

  const second = intent(first, attachLarge);

  expect(second.state.foregroundClientId).toBe(clientId(2));
  expect(second.changes.map((change) => change.type)).not.toContain('foregroundChanged');
});

it('makes a client that sends input or a request the foreground client', () => {
  const state = withClient(run([attachLarge]), 2);

  expect(state.foregroundClientId).toBe(clientId(1));

  const result = intent(state, { type: 'markClientActive', clientId: clientId(2) });

  expect(result.state.foregroundClientId).toBe(clientId(2));
  expect(result.changes).toEqual([{ type: 'foregroundChanged', clientId: clientId(2) }]);

  const again = intent(result.state, { type: 'markClientActive', clientId: clientId(2) });

  expect(again.changes).toEqual([]);
});

it('makes a client that resizes the foreground client, even at the same size', () => {
  const state = withClient(run([attachLarge]), 2);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(2),
    size: { columns: 80, rows: 24 },
  });

  expect(result.state.foregroundClientId).toBe(clientId(2));
  expect(result.changes).toEqual([{ type: 'foregroundChanged', clientId: clientId(2) }]);
});

it('gives the foreground to the client with the latest activity when the foreground leaves', () => {
  const crowded = withClient(withClient(run([attachLarge]), 2), 3);
  const second = intent(crowded, { type: 'markClientActive', clientId: clientId(2) }).state;
  const third = intent(second, { type: 'markClientActive', clientId: clientId(3) }).state;
  const first = intent(third, { type: 'markClientActive', clientId: clientId(1) }).state;

  const left = intent(first, { type: 'detachClient', clientId: clientId(1) });

  expect(left.state.foregroundClientId).toBe(clientId(3));

  expect(left.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'requested' },
    { type: 'foregroundChanged', clientId: clientId(3) },
  ]);

  const other = intent(first, { type: 'detachClient', clientId: clientId(2) });

  expect(other.state.foregroundClientId).toBe(clientId(1));
  expect(other.changes.map((change) => change.type)).toEqual(['clientDetached']);
});

it('leaves no foreground client when the last client detaches', () => {
  const result = intent(run([attachLarge]), { type: 'detachClient', clientId: clientId(1) });

  expect(result.state.foregroundClientId).toBeUndefined();
  expect(result.changes.map((change) => change.type)).toEqual(['clientDetached']);
});

it('refuses activity from an unknown client and changes nothing', () => {
  const state = run([attachLarge]);

  const result = applyIntent(state, { type: 'markClientActive', clientId: clientId(7) });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

const setTheme = (state: State, theme: Theme) =>
  intent(state, { type: 'setClientTheme', clientId: clientId(1), theme });

it('reports a theme that differs from the client theme only in its background', () => {
  const themed = setTheme(attachedState(), lightTheme).state;
  const result = setTheme(themed, darkTheme);

  expect(result.changes).toEqual([
    { type: 'clientThemeChanged', clientId: clientId(1), theme: darkTheme },
  ]);

  expect(paneTheme(result.state)).toEqual(darkTheme);
});

it('reports a theme that differs from the client theme in one palette color', () => {
  const themed = setTheme(attachedState(), lightTheme).state;
  const palette = lightTheme.palette.map((color, index) => (index === 5 ? 0xff_00_ff : color));
  const result = setTheme(themed, { ...lightTheme, palette });

  expect(result.changes).toHaveLength(1);
  expect(paneTheme(result.state)?.palette).toEqual(palette);
});

it('stores the new size of a client that resizes', () => {
  const state = run([createKoja, attachLarge]);
  const size = { columns: 60, rows: 15 };
  const result = intent(state, { type: 'resizeClient', clientId: clientId(1), size });

  expect(result.state.clients[0]).toEqual({ ...defined(state.clients[0]), size });

  const again = intent(result.state, { type: 'resizeClient', clientId: clientId(1), size });

  expect(again.changes).toEqual([]);
});

it('forgets the activity of the client that a new client takes over from', () => {
  const state = run([attachLarge]);
  const result = intent(state, attachLarge);

  expect([...result.state.clientActivity.keys()]).toEqual([clientId(2)]);
});

it('forgets the activity of a client that detaches', () => {
  const state = run([attachLarge]);
  const result = intent(state, { type: 'detachClient', clientId: clientId(1) });

  expect([...result.state.clientActivity.keys()]).toEqual([]);
});

it('resizes a running pane when the client resizes', () => {
  const started = fact(run([createKoja, attachLarge]), {
    type: 'paneStarted',
    paneId: paneId(1),
    generation: 1,
  });

  const result = intent(started.state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 60, rows: 15 },
  });

  expect(result.changes).toContainEqual({
    type: 'paneResized',
    paneId: paneId(1),
    size: { columns: 40, rows: 14 },
  });
});

it('keeps the size of a failed pane when the client resizes', () => {
  const session = savedSessionOf(run([createKoja, createDocs]), noFolders);
  const restored = intent(createState(), { type: 'restoreSession', session }).state;
  const attached = intent(restored, attachLarge).state;

  const failed = fact(attached, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: 2,
    message: 'no shell',
  }).state;

  const result = intent(failed, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 60, rows: 15 },
  });

  const resized = result.changes.flatMap((change) =>
    change.type === 'paneResized' ? [change.paneId] : [],
  );

  expect(resized).toEqual([paneId(1)]);
  expect(result.state.panes[1]?.size).toEqual(failed.panes[1]?.size);
});
