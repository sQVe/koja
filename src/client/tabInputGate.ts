import type { PaneId } from '../ids.ts';
import { shownPaneIds, viewedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

// Undefined when no pane is shown.
export type ShownPane =
  | {
      id: PaneId;
      // A failed pane has no process, so the server never sends it rows.
      failed: boolean;
    }
  | undefined;

export interface TabInputGate {
  pendingRequests: number;
  paneBeforeRequest: PaneId | undefined;
  awaitingRows: PaneId | undefined;
  freshRowPanes: ReadonlySet<PaneId>;
}

export interface GateResult {
  gate: TabInputGate;
  // Whether input that waited on the gate may go on.
  released: boolean;
}

export const shownPaneOf = (snapshot: StoreSnapshot | undefined): ShownPane => {
  if (snapshot === undefined || shownPaneIds(snapshot).size === 0) {
    return undefined;
  }

  const pane = viewedPane(snapshot);

  return pane && { id: pane.id, failed: pane.lifecycle === 'failed' };
};

export const emptyTabInputGate: TabInputGate = {
  pendingRequests: 0,
  paneBeforeRequest: undefined,
  awaitingRows: undefined,
  freshRowPanes: new Set(),
};

export const tabInputPending = (gate: TabInputGate): boolean =>
  gate.pendingRequests > 0 || gate.awaitingRows !== undefined;

const paneToAwait = (gate: TabInputGate, shown: ShownPane): PaneId | undefined => {
  if (shown === undefined || shown.failed || gate.freshRowPanes.has(shown.id)) {
    return undefined;
  }

  return shown.id;
};

export const tabRequestSent = (gate: TabInputGate, shown: ShownPane): TabInputGate => {
  if (gate.pendingRequests > 0) {
    return { ...gate, pendingRequests: gate.pendingRequests + 1 };
  }

  return {
    ...gate,
    pendingRequests: 1,
    paneBeforeRequest: shown?.id,
    freshRowPanes: new Set(),
  };
};

// The server publishes a request's store changes before it answers, so the shown pane is current
// here. Input then waits for the rows of the pane the switch shows.
export const tabAnswered = (gate: TabInputGate, done: boolean, shown: ShownPane): GateResult => {
  const pendingRequests = Math.max(gate.pendingRequests - 1, 0);
  const next = { ...gate, pendingRequests };

  if (pendingRequests > 0) {
    return { gate: next, released: false };
  }

  const awaited = paneToAwait(gate, shown);

  if (done && awaited !== undefined && awaited !== gate.paneBeforeRequest) {
    return { gate: { ...next, awaitingRows: awaited }, released: false };
  }

  return { gate: next, released: true };
};

// A pane's rows carry its modes. Only rows that arrive after a tab request are fresh: a cache from
// an earlier visit can be stale.
export const tabRowsArrived = (gate: TabInputGate, pane: PaneId): GateResult => {
  const fresh = tabInputPending(gate) ? new Set(gate.freshRowPanes).add(pane) : gate.freshRowPanes;

  if (gate.awaitingRows === pane) {
    return { gate: { ...gate, freshRowPanes: fresh, awaitingRows: undefined }, released: true };
  }

  return { gate: { ...gate, freshRowPanes: fresh }, released: false };
};

// The server stops sending rows of a pane that is no longer shown, so held input waits for the pane
// shown now instead.
export const tabSnapshotChanged = (gate: TabInputGate, shown: ShownPane): GateResult => {
  if (gate.awaitingRows === undefined) {
    return { gate, released: false };
  }

  const awaited = paneToAwait(gate, shown);

  if (awaited === undefined) {
    return { gate: { ...gate, awaitingRows: undefined }, released: true };
  }

  return { gate: { ...gate, awaitingRows: awaited }, released: false };
};
