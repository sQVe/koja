import type { Change, RejectReason, State } from './store.ts';

// A transition's result before the store assigns a revision to it.
export interface Proposal {
  kind: 'proposed';
  state: State;
  changes: readonly Change[];
}

export interface Refusal {
  kind: 'refused';
  reason: RejectReason;
}

export type Outcome = Proposal | Refusal;

export const propose = (state: State, changes: readonly Change[]): Proposal => ({
  kind: 'proposed',
  state,
  changes,
});

export const refuse = (reason: RejectReason): Refusal => ({ kind: 'refused', reason });
