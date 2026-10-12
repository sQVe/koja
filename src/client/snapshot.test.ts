import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { applyChange, focusedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

const size = { columns: 80, rows: 24 };

const first = { id: clientId(1), size, theme: undefined };

const second = { id: clientId(2), size, theme: undefined };

const snapshot: StoreSnapshot = {
  revision: 3,
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work/phi',
      label: 'phi',
      tabIds: [tabId(1)],
      activeTabId: tabId(1),
    },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: { kind: 'pane', paneId: paneId(1) },
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
    },
  ],
  panes: [
    {
      id: paneId(1),
      tabId: tabId(1),
      lifecycle: 'running',
      generation: 1,
      size,
      exitCode: undefined,
    },
  ],
  focusedWorkspaceId: workspaceId(1),
  attachedClientId: first.id,
  clients: [first],
};

it('replaces the attached client when a client takes over', () => {
  const detached = applyChange(snapshot, {
    type: 'clientDetached',
    clientId: first.id,
    reason: 'takenOver',
  });

  const attached = applyChange(detached, { type: 'clientAttached', client: second });

  expect(attached.clients).toEqual([second]);
  expect(attached.attachedClientId).toBe(second.id);
});

it('records the exit of the pane', () => {
  const exited = applyChange(snapshot, {
    type: 'paneStateChanged',
    paneId: paneId(1),
    lifecycle: 'exited',
    exitCode: 3,
  });

  expect(focusedPane(exited)?.lifecycle).toBe('exited');
  expect(focusedPane(exited)?.exitCode).toBe(3);
});

it('resizes only the client the change names', () => {
  const resized = { columns: 100, rows: 30 };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientResized', clientId: second.id, size: resized });

  expect(next.clients).toEqual([first, { ...second, size: resized }]);
});

it('records the theme of only the client the change names', () => {
  const theme = { foreground: 1, background: 2, palette: Array.from({ length: 16 }, () => 3) };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientThemeChanged', clientId: second.id, theme });

  expect(next.clients).toEqual([first, { ...second, theme }]);
});
