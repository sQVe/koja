import type { PaneRuntime } from './pane.ts';
import type { RowPublication } from './rowSubscriptions.ts';

// What the server keeps for a pane that is running. Its generation is `runtime.generation`.
export interface RunningPane {
  runtime: PaneRuntime;
  publication: RowPublication;
}
