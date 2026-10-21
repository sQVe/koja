import type { PaneId } from '../ids.ts';

export interface ShownPane {
  id: PaneId | undefined;
  // A failed pane has no process, so the server never sends it rows.
  failed: boolean;
}

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

export const emptyTabInputGate: TabInputGate = {
  pendingRequests: 0,
  paneBeforeRequest: undefined,
  awaitingRows: undefined,
  freshRowPanes: new Set(),
};

export const tabInputPending = (gate: TabInputGate): boolean =>
  gate.pendingRequests > 0 || gate.awaitingRows !== undefined;

const needsFreshRows = (gate: TabInputGate, shown: ShownPane & { id: PaneId }): boolean =>
  !shown.failed && !gate.freshRowPanes.has(shown.id);

export const tabRequestSent = (gate: TabInputGate, shownPane: PaneId | undefined): TabInputGate => {
  if (gate.pendingRequests > 0) {
    return { ...gate, pendingRequests: gate.pendingRequests + 1 };
  }

  return {
    ...gate,
    pendingRequests: 1,
    paneBeforeRequest: shownPane,
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

  const switched = done && shown.id !== undefined && shown.id !== gate.paneBeforeRequest;

  if (switched && shown.id !== undefined && needsFreshRows(gate, { ...shown, id: shown.id })) {
    return { gate: { ...next, awaitingRows: shown.id }, released: false };
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

  if (shown.id === undefined || !needsFreshRows(gate, { ...shown, id: shown.id })) {
    return { gate: { ...gate, awaitingRows: undefined }, released: true };
  }

  return { gate: { ...gate, awaitingRows: shown.id }, released: false };
};
