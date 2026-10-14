import { expect, it } from 'bun:test';

import { applyChange } from '../src/client/snapshot.ts';
import type { StoreSnapshot } from '../src/client/snapshot.ts';
import { tabId, workspaceId } from '../src/ids.ts';
import { applyIntent, createState, snapshot as storeSnapshot } from '../src/store/store.ts';
import type { Intent } from '../src/store/store.ts';

const applyStoreIntents = (intents: readonly Intent[]) => {
  let state = createState();
  let client: StoreSnapshot | undefined;

  for (const next of intents) {
    const result = applyIntent(state, next);

    if (result.kind !== 'applied') {
      throw new Error(`Expected an applied transition, got ${result.kind}.`);
    }

    client ??= storeSnapshot(state);
    client = result.changes.reduce(applyChange, client);
    state = result.state;
  }

  return { state, client: client ?? storeSnapshot(state) };
};

it('matches the store workspaces after the store creates a tab', () => {
  const { state, client } = applyStoreIntents([
    { type: 'createWorkspace', root: '/work/phi', label: 'phi', background: false },
    { type: 'createTab', workspaceId: workspaceId(1), folder: undefined },
  ]);

  expect(client.workspaces).toEqual(state.workspaces);
  expect(client.workspaces[0]?.tabIds).toEqual([tabId(1), tabId(2)]);
  expect(client.defaultView.activeTabs).toEqual([{ workspaceId: workspaceId(1), tabId: tabId(2) }]);
});

it('keeps a live tab in the workspace after the original tab closes', () => {
  const { state, client } = applyStoreIntents([
    { type: 'createWorkspace', root: '/work/phi', label: 'phi', background: false },
    { type: 'createTab', workspaceId: workspaceId(1), folder: undefined },
    { type: 'closeTab', tabId: tabId(1) },
  ]);

  expect(client.workspaces).toEqual(state.workspaces);
  expect(client.workspaces[0]?.tabIds).toEqual([tabId(2)]);
});
