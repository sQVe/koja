import type { PaneId } from './ids.ts';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export interface Layout {
  kind: 'pane';
  paneId: PaneId;
}

const detachedSize: TerminalSize = { columns: 80, rows: 24 };
const statusBarRows = 1;

export const sideListColumns = 20;

// A narrow client hides the side list so the pane keeps the width the server gives it.
export const sideListWidth = (clientColumns: number): number =>
  clientColumns > sideListColumns * 2 ? sideListColumns : 0;

export const paneSize = (client: TerminalSize | undefined): TerminalSize => {
  if (client === undefined) {
    return detachedSize;
  }

  return {
    columns: Math.max(1, client.columns - sideListWidth(client.columns)),
    rows: Math.max(1, client.rows - statusBarRows),
  };
};
