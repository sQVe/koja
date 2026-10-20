import type { Change, Intent, RejectReason } from '../store/store.ts';

export type DispatchResult =
  | {
      kind: 'applied';
      changes: readonly Change[];
      // The message of a new pane that failed to start while the changes ran.
      startFailure: string | undefined;
    }
  | { kind: 'rejected'; reason: RejectReason };

export type Dispatch = (intent: Intent) => DispatchResult;

export const changesOf = (result: DispatchResult): readonly Change[] =>
  result.kind === 'applied' ? result.changes : [];
