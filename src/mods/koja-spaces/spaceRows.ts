import type { Context, Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dragLine } from '../../kit/drag.ts';
import type { DropMark } from '../../kit/index.ts';
import { detailText, listRow, projectHeader, spaceMark } from '../../kit/index.ts';
import type { Project } from './projects.ts';
import type { Pull } from './pulls.ts';
import { rowCut } from './rows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

export interface RowState {
  drag: DragState;
  // The row the drag is over that the dragged space cannot land on.
  refused: string | null;
  cursor: string | null;
  age: string | null;
  lookup: (git: GitInfo | null) => Pull | null;
  attachDrag: (element: Element, space: SpaceInfo, ids: readonly string[]) => void;
}

export interface HeaderState extends RowState {
  hovered: string | null;
  onHover: (spaceId: string, hovered: boolean, cx: Context) => void;
  toggleFold: (key: string, cx: Context) => void;
}

const dropMark = (state: RowState, id: string, ids: readonly string[]): DropMark | undefined =>
  state.refused === id ? 'refused' : dragLine(state.drag, id, ids);

const rowTitle = (row: ListedSpace, pull: Pull | null): string =>
  row.space.named ? row.space.name : (pull?.title ?? row.space.name);

export const row = (listed: ListedSpace, ids: readonly string[], state: RowState): Element => {
  const { space } = listed;
  const drop = dropMark(state, space.id, ids);
  const pull = state.lookup(listed.git);
  const end = state.age === null ? [] : [detailText(state.age)];

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    start: spaceMark(listed.status),
    label: rowTitle(listed, pull),
    cut: rowCut(space.named, pull),
    ...(drop === undefined ? {} : { drop }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    cursor: state.cursor === space.id,
    end,
  }).id(`space-${space.id}`);

  state.attachDrag(element, space, ids);

  return element;
};

const foldable = (project: Project): boolean => project.spaces.length + project.hidden > 0;

export const headerRow = (
  project: Project,
  main: ListedSpace,
  ids: readonly string[],
  state: HeaderState,
): Element => {
  const { space } = main;
  const drop = dropMark(state, space.id, ids);

  const element = projectHeader({
    kind: 'space',
    name: project.name,
    ...(project.machine === null ? {} : { machine: project.machine }),
    folded: project.folded,
    hidden: project.hidden,
    onToggle: (cx) => {
      state.toggleFold(project.key, cx);
    },
    mark: spaceMark(main.status),
    age: state.age,
    selected: space.active,
    cursor: state.cursor === space.id,
    hovered: state.hovered === space.id,
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    ...(drop === undefined ? {} : { drop }),
  }).id(`space-${space.id}`);

  state.attachDrag(element, space, ids);

  if (foldable(project)) {
    element.on_hover((hovered, cx) => {
      state.onHover(space.id, hovered, cx);
    });
  }

  return element;
};
