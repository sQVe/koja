import type { Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dragLine } from '../../kit/drag.ts';
import { listRow, spaceMark } from '../../kit/index.ts';
import type { Pull } from './pulls.ts';
import { rowCut } from './rows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

export interface RowState {
  drag: DragState;
  cursor: string | null;
  lookup: (git: GitInfo | null) => Pull | null;
  attachDrag: (element: Element, space: SpaceInfo, ids: readonly string[]) => void;
}

const rowTitle = (row: ListedSpace, pull: Pull | null): string =>
  row.space.named ? row.space.name : (pull?.title ?? row.space.name);

export const row = (listed: ListedSpace, ids: readonly string[], state: RowState): Element => {
  const { space } = listed;
  const line = dragLine(state.drag, space.id, ids);
  const pull = state.lookup(listed.git);

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    start: spaceMark(listed.status),
    label: rowTitle(listed, pull),
    cut: rowCut(space.named, pull),
    ...(line === undefined ? {} : { dropLine: line }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    cursor: state.cursor === space.id,
  }).id(`space-${space.id}`);

  state.attachDrag(element, space, ids);

  return element;
};
