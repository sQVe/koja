import { HoverCard } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';

import type { StackNeed } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { DragState } from '../../kit/drag.ts';
import { dragLine } from '../../kit/drag.ts';
import type { DropMark, StackCardModel } from '../../kit/index.ts';
import {
  controlSize,
  detailText,
  emptyWorkSlot,
  listRow,
  projectHeader,
  spaceMark,
  stackCard,
  stackProgress,
  workIcon,
} from '../../kit/index.ts';
import type { Project } from './projects.ts';
import { rowCut } from './rows.ts';
import { openSpaceMenu } from './spaceMenu.ts';
import type { ListedSpace } from './tree.ts';

interface RowBaseState {
  drag: DragState;
  refused: string | null;
  cursor: string | null;
  age: string | null;
}

export type RowInteraction =
  | {
      kind: 'reorder';
      start: (space: SpaceInfo, ids: readonly string[]) => void;
      move: (space: SpaceInfo, cx: Context) => void;
      drop: (space: SpaceInfo, ids: readonly string[], cx: Context) => void;
    }
  | {
      kind: 'select';
      select: (id: string, cx: Context) => void;
    };

export interface RowState extends RowBaseState {
  title: string;
  need: StackNeed | null;
  progress: { merged: number; total: number } | null;
  card: StackCardModel | null;
  interaction: RowInteraction;
}

export interface ReorderCallbacks {
  start: () => void;
  move: (cx: Context) => void;
  drop: (cx: Context) => void;
}

export interface HeaderState extends RowBaseState {
  hovered: string | null;
  onHover: (spaceId: string, hovered: boolean, cx: Context) => void;
  toggleFold: (key: string, cx: Context) => void;
  reorder: ReorderCallbacks;
}

const dropMark = (state: RowBaseState, id: string, ids: readonly string[]): DropMark | undefined =>
  state.refused === id ? 'refused' : dragLine(state.drag, id, ids);

const projectDetail = (projectName: string): Element =>
  detailText(projectName).max_w(controlSize.factValueMaxWidth).truncate();

export const attachReorder = (element: Element, callbacks: ReorderCallbacks): void => {
  element
    .on_mouse_down('left', () => {
      callbacks.start();
    })
    .on_mouse_move((_event, cx) => {
      callbacks.move(cx);
    })
    .on_mouse_up('left', (_event, cx) => {
      callbacks.drop(cx);
    });
};

const attachInteraction = (
  element: Element,
  space: SpaceInfo,
  ids: readonly string[],
  interaction: RowInteraction,
): void => {
  if (interaction.kind === 'reorder') {
    attachReorder(element, {
      start: () => {
        interaction.start(space, ids);
      },
      move: (cx) => {
        interaction.move(space, cx);
      },
      drop: (cx) => {
        interaction.drop(space, ids, cx);
      },
    });
  } else {
    element.on_click((_event, cx) => {
      interaction.select(space.id, cx);
    });
  }

  element.on_mouse_down('right', () => {
    openSpaceMenu(space);
  });
};

const cardWrap = (element: Element, space: SpaceInfo, card: StackCardModel | null): Element => {
  if (card === null) {
    return element;
  }

  return HoverCard.new(`stack-card-${space.id}`)
    .trigger(element)
    .content(stackCard(card))
    .anchor('left_center');
};

export const row = (
  listed: ListedSpace,
  ids: readonly string[],
  state: RowState,
  pull: Pull | null,
  ticketTitle: string | null,
  projectName: string | null,
): Element => {
  const { space } = listed;
  const drop = dropMark(state, space.id, ids);
  const end: Element[] = [];

  if (projectName !== null) {
    end.push(projectDetail(projectName));
  }

  if (state.age !== null) {
    end.push(detailText(state.age));
  }

  if (state.progress !== null) {
    end.push(stackProgress({ ...state.progress, label: 'count' }));
  }

  const workSlot = state.need === null ? emptyWorkSlot() : workIcon(state.need);

  end.push(workSlot);

  const rowState = space.active ? 'selected' : 'normal';

  const element = listRow({
    size: 'small',
    inset: true,
    state: rowState,
    start: spaceMark(listed.status),
    label: state.title,
    cut: rowCut(space.named, pull, ticketTitle),
    ...(drop === undefined ? {} : { drop }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    cursor: state.cursor === space.id,
    end,
  }).id(`space-${space.id}`);

  attachInteraction(element, space, ids, state.interaction);

  return cardWrap(element, space, state.card);
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

  attachReorder(element, state.reorder);

  element.on_mouse_down('right', () => {
    openSpaceMenu(space);
  });

  if (foldable(project)) {
    element.on_hover((hovered, cx) => {
      state.onHover(space.id, hovered, cx);
    });
  }

  return element;
};
