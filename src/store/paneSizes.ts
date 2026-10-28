import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { layoutPanes, tabPanes } from '../layout.ts';
import type { TerminalSize } from '../layout.ts';
import type { Change, Pane, State, Tab } from './store.ts';

export const sameSize = (left: TerminalSize, right: TerminalSize): boolean =>
  left.columns === right.columns && left.rows === right.rows;

export const isLive = (pane: Pane): boolean =>
  pane.lifecycle === 'starting' || pane.lifecycle === 'running';

// A tab without room for its panes has no sizes, so its panes keep the sizes they have.
export const tabPaneSizes = (
  tabs: readonly Tab[],
  area: TerminalSize,
): Map<PaneId, TerminalSize> => {
  const sizes = new Map<PaneId, TerminalSize>();

  for (const tab of tabs) {
    const placed = tabPanes(tab, area);
    const rectangles = placed.ok ? placed.panes : [];

    for (const { paneId: id, terminal } of rectangles) {
      sizes.set(id, { columns: terminal.columns, rows: terminal.rows });
    }
  }

  return sizes;
};

export const fitPanes = (state: State): { panes: readonly Pane[]; changes: Change[] } => {
  const sizes = tabPaneSizes(state.tabs, state.layoutArea);
  const changes: Change[] = [];

  const panes = state.panes.map((pane) => {
    const size = sizes.get(pane.id);

    if (size === undefined || !isLive(pane) || sameSize(size, pane.size)) {
      return pane;
    }

    changes.push({ type: 'paneResized', paneId: pane.id, size });

    return { ...pane, size };
  });

  return { panes, changes };
};

export const lonePaneSize = (state: State, id: PaneId): TerminalSize => {
  const [lone] = layoutPanes({ kind: 'pane', paneId: id }, state.layoutArea);

  invariant(lone !== undefined, `Layout has no pane ${id}.`);

  return { columns: lone.terminal.columns, rows: lone.terminal.rows };
};
