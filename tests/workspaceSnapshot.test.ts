import { expect, it } from 'bun:test';

import { applyChange } from '../src/client/snapshot.ts';
import type { StoreSnapshot } from '../src/client/snapshot.ts';
import { paneId, workspaceId } from '../src/ids.ts';
import {
  applyFact,
  applyIntent,
  createState,
  snapshot as storeSnapshot,
} from '../src/store/store.ts';
import type { Change, Fact, Intent, State } from '../src/store/store.ts';

interface Replay {
  state: State;
  mirror: StoreSnapshot;
}

const create = (root: string): Intent => ({
  type: 'createWorkspace',
  root,
  label: root,
  focus: true,
});

const replay = (steps: readonly (Intent | Fact)[]): Replay => {
  let state = createState();
  let mirror: StoreSnapshot = storeSnapshot(state);

  for (const step of steps) {
    const result = 'generation' in step ? applyFact(state, step) : applyIntent(state, step);

    if (result.kind !== 'applied') {
      throw new Error(`Expected ${step.type} to apply.`);
    }

    const changes: readonly Change[] = result.changes;

    state = result.state;
    mirror = changes.reduce(applyChange, mirror);
  }

  return { state, mirror };
};

const expectSameLayout = ({ state, mirror }: Replay): void => {
  const expected = storeSnapshot(state);

  expect(mirror.workspaces).toEqual(expected.workspaces);
  expect(mirror.tabs).toEqual(expected.tabs);
  expect(mirror.panes).toEqual(expected.panes);
  expect(mirror.defaultView).toEqual(expected.defaultView);
};

it('mirrors create, focus, rename, and close in the client snapshot', () => {
  const result = replay([
    create('a'),
    create('b'),
    create('c'),
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
    { type: 'renameWorkspace', workspaceId: workspaceId(2), label: 'renamed' },
    { type: 'closeWorkspace', workspaceId: workspaceId(1) },
  ]);

  expectSameLayout(result);
  expect(result.mirror.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('mirrors the focus after the focused last workspace closes', () => {
  const result = replay([
    create('a'),
    create('b'),
    { type: 'closeWorkspace', workspaceId: workspaceId(2) },
  ]);

  expectSameLayout(result);
  expect(result.mirror.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
});

it('mirrors the exit of the only pane in the client snapshot', () => {
  const result = replay([
    create('a'),
    { type: 'paneExited', paneId: paneId(1), generation: 1, exitCode: 0 },
  ]);

  expectSameLayout(result);

  expect(result.mirror.workspaces).toEqual([
    { id: workspaceId(1), root: 'a', label: 'a', tabIds: [] },
  ]);

  expect(result.mirror.tabs).toEqual([]);
  expect(result.mirror.panes).toEqual([]);
  expect(result.mirror.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
});
