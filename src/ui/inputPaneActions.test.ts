import { expect, it } from 'bun:test';

import { actionCatalog } from '../actions.ts';
import type { PaneAction } from '../actions.ts';
import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { createInputHarness, firstWorkspace, storeSnapshotOf } from './inputFixtures.ts';

const paneKeys: [string, PaneAction][] = [
  ['s', 'splitBelow'],
  ['v', 'splitRight'],
  ['h', 'focusPrevious'],
  ['l', 'focusNext'],
  ['x', 'close'],
  ['z', 'zoom'],
  ['<', 'resizeLeft'],
  ['>', 'resizeRight'],
  ['-', 'resizeUp'],
  ['+', 'resizeDown'],
  ['!', 'breakPane'],
];

for (const [raw, action] of paneKeys) {
  it(`asks for ${action} on ${raw} in normal mode, sends no bytes, and stays in normal mode`, () => {
    const { press, sent, actions, mode } = createInputHarness('insert');

    press('\x02');
    press(raw);

    expect(actions).toEqual([action]);
    expect(sent).toEqual([]);
    expect(mode()).toBe('normal');
  });

  it(`sends ${raw} to the pane in insert mode without a pane action`, () => {
    const { press, sent, actions } = createInputHarness('insert');

    press(raw);

    expect(actions).toEqual([]);
    expect(sent).toEqual([raw]);
  });
}

it('holds the tokens after a pane action until its answer arrives, then sends them in order', async () => {
  const { press, sent, actions, answerPaneAction } = createInputHarness('insert');

  press('\x02');
  press('h');
  press('i');
  press('a');
  press('b');

  expect(actions).toEqual(['focusPrevious']);
  expect(sent).toEqual([]);

  await answerPaneAction();

  expect(sent).toEqual(['a', 'b']);
});

it('holds the tokens that follow a second pane action until that action is answered', async () => {
  const { press, sent, actions, answerPaneAction } = createInputHarness('insert');

  for (const raw of ['\x02', 'l', 's', 'i', 'z']) {
    press(raw);
  }

  await answerPaneAction();

  expect(actions).toEqual(['focusNext', 'splitBelow']);
  expect(sent).toEqual([]);

  await answerPaneAction();

  expect(sent).toEqual(['z']);
});

it('sends held tokens when the action fails to settle normally', async () => {
  const { press, sent } = createInputHarness('insert', {
    paneAction: () => Promise.reject(new Error('lost')),
  });

  press('\x02');
  press('x');
  press('i');
  press('q');
  await Promise.resolve();
  await Promise.resolve();

  expect(sent).toEqual(['q']);
});

it('routes a key from the catalog it is given and sends nothing for the replaced key', () => {
  const zoom = actionCatalog.find((entry) => entry.id === 'pane.zoom');
  invariant(zoom !== undefined, 'the catalog has pane.zoom');
  const catalog = [...actionCatalog.filter((entry) => entry !== zoom), { ...zoom, keys: ['Z'] }];
  const { press, sent, actions } = createInputHarness('insert', { catalog });

  press('\x02');
  press('Z');

  expect(actions).toEqual(['zoom']);

  press('z');

  expect(actions).toEqual(['zoom']);
  expect(sent).toEqual([]);
});

const onlyPaneSnapshot = () =>
  storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }, [
    { id: 1, workspaceId: firstWorkspace, panes: [paneId(1)], focused: paneId(1) },
  ]);

it('closes the only pane once for one x press in normal mode, with no bytes to the pane', () => {
  const { press, sent, actions, mode } = createInputHarness('insert', {
    snapshot: onlyPaneSnapshot,
  });

  press('\x02');
  press('x');

  expect(actions).toEqual(['close']);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('closes the pane once for a held x, which sends press then repeat events', async () => {
  const { press, sent, actions, answerPaneAction } = createInputHarness('insert', {
    snapshot: onlyPaneSnapshot,
  });

  press('\x02');
  press('x');
  press('\x1b[120;1:2u');
  press('\x1b[120;1:2u');

  await answerPaneAction();

  expect(actions).toEqual(['close']);
  expect(sent).toEqual([]);
});

it('sends no pane action and no bytes for a key whose action is unavailable', () => {
  const onePane = storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }, [
    { id: 1, workspaceId: firstWorkspace, panes: [paneId(1)], focused: paneId(1) },
  ]);

  const { press, sent, actions, mode } = createInputHarness('insert', {
    snapshot: () => onePane,
  });

  press('\x02');
  press('l');

  expect(actions).toEqual([]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});
