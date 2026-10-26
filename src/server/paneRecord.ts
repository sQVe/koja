import type { PaneRuntime } from './pane.ts';
import type { RowPublication } from './rowSubscriptions.ts';

// The record's generation is `runtime.generation`. Do not add a second generation field.
export interface RunningPane {
  runtime: PaneRuntime;
  reportPass: string;
  publication: RowPublication;
}
