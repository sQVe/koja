import type { PaneId } from '../ids.ts';
import type { State } from './store.ts';

export const withoutStartupRecords = (state: State, removed: readonly PaneId[]): State => {
  const stateBeforeSplit = new Map(state.stateBeforeSplit);

  for (const id of removed) {
    stateBeforeSplit.delete(id);
  }

  return {
    ...state,
    stateBeforeSplit,
    startFallbacks: state.startFallbacks.filter((known) => !removed.includes(known.paneId)),
  };
};
