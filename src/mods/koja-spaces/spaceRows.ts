import type { Context, Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';

import type { StackNeed } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { DragState } from '../../kit/drag.ts';
import { dragLine } from '../../kit/drag.ts';
import type { DropMark } from '../../kit/index.ts';
import {
  controlSize,
  detailText,
  emptyWorkSlot,
  listRow,
  projectHeader,
  spaceMark,
  workIcon,
} from '../../kit/index.ts';
import type { Project } from './projects.ts';
import { rowCut, rowTitleOf } from './rows.ts';
import type { ListedSpace } from './tree.ts';

interface RowBaseState {
  drag: DragState;
  refused: string | null;
  cursor: string | null;
  age: string | null;
  attachDrag: (element: Element, space: SpaceInfo, ids: readonly string[]) => void;
}

export interface RowFacts {
  ticketTitle: string | null;
  need: StackNeed | null;
}

export interface RowState extends RowBaseState {
  need: StackNeed | null;
}

export interface HeaderState extends RowBaseState {
  hovered: string | null;
  onHover: (spaceId: string, hovered: boolean, cx: Context) => void;
  toggleFold: (key: string, cx: Context) => void;
}

const dropMark = (state: RowBaseState, id: string, ids: readonly string[]): DropMark | undefined =>
  state.refused === id ? 'refused' : dragLine(state.drag, id, ids);

const projectDetail = (project: string): Element =>
  detailText(project).max_w(controlSize.factValueMaxWidth).truncate();

export const row = (
  listed: ListedSpace,
  ids: readonly string[],
  state: RowState,
  pull: Pull | null,
  ticketTitle: string | null,
  project: string | null = null,
): Element => {
  const { space } = listed;
  const drop = dropMark(state, space.id, ids);
  const end: Element[] = project === null ? [] : [projectDetail(project)];

  if (state.age !== null) {
    end.push(detailText(state.age));
  }

  const workSlot = state.need === null ? emptyWorkSlot() : workIcon(state.need);

  end.push(workSlot);

  const rowState = space.active ? 'selected' : 'normal';

  const element = listRow({
    size: 'small',
    inset: true,
    state: rowState,
    start: spaceMark(listed.status),
    label: rowTitleOf(space.named, space.name, pull, ticketTitle),
    cut: rowCut(space.named, pull, ticketTitle),
    ...(drop === undefined ? {} : { drop }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    cursor: state.cursor === space.id,
    end,
  }).id(`space-${space.id}`);

  if (project === null) {
    state.attachDrag(element, space, ids);
  }

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
  const drop = dropMark(state, project.key, ids);

  const element = projectHeader({
    kind: 'space',
    name: project.name,
    ...(project.machine === null ? {} : { machine: project.machine }),
    folded: project.folded,
    hidden: project.hidden,
    onToggle: (cx) => {
      state.toggleFold(project.key, cx);
    },
    status: main.status,
    age: state.age,
    selected: space.active,
    cursor: state.cursor === space.id,
    hovered: state.hovered === space.id,
    dragged: state.drag.source === project.key && state.drag.over !== project.key,
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
