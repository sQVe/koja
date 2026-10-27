import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { StoreSnapshot } from './snapshot.ts';
import {
  emptyTabInputGate,
  shownPaneOf,
  tabAnswered,
  tabInputPending,
  tabRequestSent,
  tabRowsArrived,
  tabSnapshotChanged,
} from './tabInputGate.ts';

const pane7 = { id: paneId(7), failed: false };
const pane8 = { id: paneId(8), failed: false };
const pane9 = { id: paneId(9), failed: false };

it('waits for fresh rows of the pane a tab switch shows', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);

  expect(answered.released).toBe(false);
  expect(tabInputPending(answered.gate)).toBe(true);

  const arrived = tabRowsArrived(answered.gate, pane8.id);

  expect(arrived.released).toBe(true);
  expect(tabInputPending(arrived.gate)).toBe(false);
});

it('waits for the rows of the pane a tab request shows when no pane was shown before', () => {
  const sent = tabRequestSent(emptyTabInputGate, undefined);
  const answered = tabAnswered(sent, true, pane8);

  expect(answered.released).toBe(false);
  expect(tabInputPending(answered.gate)).toBe(true);
});

it('releases once after both of two requests are answered', () => {
  const first = tabRequestSent(emptyTabInputGate, pane7);
  const second = tabRequestSent(first, pane7);
  const firstAnswer = tabAnswered(second, true, pane8);

  expect(firstAnswer.released).toBe(false);
  expect(tabInputPending(firstAnswer.gate)).toBe(true);

  const secondAnswer = tabAnswered(firstAnswer.gate, true, pane7);

  expect(secondAnswer.released).toBe(true);
  expect(tabInputPending(secondAnswer.gate)).toBe(false);
});

it('releases at once when the answer failed', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, false, pane8);

  expect(answered.released).toBe(true);
  expect(tabInputPending(answered.gate)).toBe(false);
});

it('releases at once when the answer did not switch the shown pane', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane7);

  expect(answered.released).toBe(true);
  expect(tabInputPending(answered.gate)).toBe(false);
});

it('releases an answer that has no pending request', () => {
  const answered = tabAnswered(emptyTabInputGate, false, pane7);

  expect(answered.released).toBe(true);

  const sent = tabRequestSent(answered.gate, pane7);

  expect(tabInputPending(sent)).toBe(true);
});

it('releases at once when the shown pane failed', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, { id: pane8.id, failed: true });

  expect(answered.released).toBe(true);
  expect(tabInputPending(answered.gate)).toBe(false);
});

it('retargets the wait when focus moves to another pane', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const moved = tabSnapshotChanged(answered.gate, pane9);

  expect(moved.released).toBe(false);
  expect(tabInputPending(moved.gate)).toBe(true);

  const stale = tabRowsArrived(moved.gate, pane8.id);

  expect(stale.released).toBe(false);

  const arrived = tabRowsArrived(stale.gate, pane9.id);

  expect(arrived.released).toBe(true);
});

it('releases when focus moves to a failed pane', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const moved = tabSnapshotChanged(answered.gate, { id: pane9.id, failed: true });

  expect(moved.released).toBe(true);
  expect(tabInputPending(moved.gate)).toBe(false);
});

it('keeps waiting when the snapshot changes but the shown pane stays', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const same = tabSnapshotChanged(answered.gate, pane8);

  expect(same.released).toBe(false);
  expect(tabInputPending(same.gate)).toBe(true);
});

it('does not count a cache from an earlier visit as fresh', () => {
  const early = tabRowsArrived(emptyTabInputGate, pane8.id);
  const sent = tabRequestSent(early.gate, pane7);
  const answered = tabAnswered(sent, true, pane8);

  expect(answered.released).toBe(false);
  expect(tabInputPending(answered.gate)).toBe(true);
});

it('counts rows that arrive while the request is pending as fresh', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const arrived = tabRowsArrived(sent, pane8.id);
  const answered = tabAnswered(arrived.gate, true, pane8);

  expect(arrived.released).toBe(false);
  expect(answered.released).toBe(true);
  expect(tabInputPending(answered.gate)).toBe(false);
});

it('releases an answer that shows no pane', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, undefined);

  expect(answered.released).toBe(true);
  expect(tabInputPending(answered.gate)).toBe(false);
});

it('leaves the gate alone on a snapshot change while no rows are awaited', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const changed = tabSnapshotChanged(sent, pane8);

  expect(changed.released).toBe(false);
  expect(changed.gate).toEqual(sent);
});

it('releases when focus moves to no pane', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const moved = tabSnapshotChanged(answered.gate, undefined);

  expect(moved.released).toBe(true);
  expect(tabInputPending(moved.gate)).toBe(false);
});

const size = { columns: 80, rows: 24 };

const snapshotShowing = (lifecycle: 'running' | 'failed'): StoreSnapshot => {
  const view = {
    focusedWorkspaceId: workspaceId(1),
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
    scrolls: [],
  };

  return {
    revision: 1,
    workspaces: [{ id: workspaceId(1), root: '/work', label: 'work', tabIds: [tabId(1)] }],
    tabs: [
      {
        id: tabId(1),
        workspaceId: workspaceId(1),
        layout: { kind: 'pane', paneId: pane7.id },
        arrangement: { choice: 'legacy', order: [pane7.id] },
        focusedPaneId: pane7.id,
        zoomedPaneId: undefined,
        label: undefined,
      },
    ],
    panes: [
      {
        id: pane7.id,
        tabId: tabId(1),
        lifecycle,
        generation: 1,
        size,
        exitCode: undefined,
        startFolder: undefined,
        restored: false,
        error: undefined,
      },
    ],
    defaultView: view,
    attachedClientId: clientId(1),
    foregroundClientId: clientId(1),
    clients: [{ id: clientId(1), size, theme: undefined, view }],
  };
};

it('names the pane a snapshot shows', () => {
  expect(shownPaneOf(snapshotShowing('running'))).toEqual({ id: pane7.id, failed: false });
});

it('marks a shown pane that failed', () => {
  expect(shownPaneOf(snapshotShowing('failed'))).toEqual({ id: pane7.id, failed: true });
});

it('shows no pane before a snapshot arrives', () => {
  expect(shownPaneOf(undefined)).toEqual(undefined);
});

it('takes a stray answer after the awaited rows arrived', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const arrived = tabRowsArrived(answered.gate, pane8.id);
  const stray = tabAnswered(arrived.gate, false, pane8);

  expect(stray.released).toBe(true);
  expect(tabInputPending(stray.gate)).toBe(false);
});

it('takes a stray answer after a snapshot change released the wait', () => {
  const sent = tabRequestSent(emptyTabInputGate, pane7);
  const answered = tabAnswered(sent, true, pane8);
  const moved = tabSnapshotChanged(answered.gate, { id: pane9.id, failed: true });
  const stray = tabAnswered(moved.gate, false, pane9);

  expect(stray.released).toBe(true);
  expect(tabInputPending(stray.gate)).toBe(false);
});
