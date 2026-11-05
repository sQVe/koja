import type { Context, Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dragLine } from '../../kit/drag.ts';
import type { ThemeToken } from '../../kit/index.ts';
import {
  colors,
  detailText,
  foldChevron,
  listRow,
  repoLabel,
  spaceMark,
  statusMark,
} from '../../kit/index.ts';
import type { Pull } from './pulls.ts';
import { pullState } from './pulls.ts';
import { labelDetail, rowCut } from './rows.ts';
import type { GitInfo, ListedSpace, RepoRow, SpaceRow } from './tree.ts';

export interface RowState {
  drag: DragState;
  hovered: string | null;
  lookup: (git: GitInfo | null) => Pull | null;
  attachDrag: (element: Element, space: SpaceInfo, ids: readonly string[]) => void;
  onHover: (spaceId: string, hovered: boolean, cx: Context) => void;
  toggleFold: (repoKey: string, cx: Context) => void;
}

const pullColors: Record<string, ThemeToken> = {
  open: 'ansi2',
  draft: 'dim',
  merged: 'ansi5',
  closed: 'ansi1',
};

const pullDetail = (row: ListedSpace, lookup: RowState['lookup']): Element[] => {
  const pull = lookup(row.git);

  if (pull === null) {
    return [];
  }

  const token = pullColors[pullState(pull)] ?? 'dim';

  return [detailText(`#${pull.number}`, colors()[token])];
};

export const rowTitle = (row: ListedSpace, lookup: RowState['lookup']): string => {
  return row.space.named ? row.space.name : (lookup(row.git)?.title ?? row.space.name);
};

const foldToggle = (row: RepoRow, toggleFold: RowState['toggleFold']): Element => {
  const { fold, main, repo } = row;

  return foldChevron(fold?.folded === true)
    .id(`fold-${main.space.id}`)
    .hover((style) => style.text_color(colors().foreground))
    .on_mouse_down('left', (_event, cx) => {
      cx.stop_propagation();
    })
    .on_mouse_up('left', (_event, cx) => {
      cx.stop_propagation();
      toggleFold(repo.key, cx);
    });
};

const foldControls = (row: RepoRow, state: RowState): Element[] => {
  const { fold, main } = row;

  if (fold === null) {
    return [];
  }

  const controls: Element[] = [];

  if (fold.hidden > 0) {
    controls.push(detailText(String(fold.hidden)));
  }

  if (state.hovered === main.space.id) {
    controls.push(foldToggle(row, state.toggleFold));
  }

  return controls;
};

export const labelRow = (row: RepoRow, ids: readonly string[], state: RowState): Element => {
  const { main, name, fold } = row;
  const { space } = main;
  const line = dragLine(state.drag, space.id, ids);

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    label: repoLabel({
      name,
      ...labelDetail(main),
      folded: fold?.folded === true,
      selected: space.active,
    }),
    ...(line === undefined ? {} : { dropLine: line }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    end: [...foldControls(row, state), statusMark(main.status)],
  }).id(`space-${space.id}`);

  state.attachDrag(element, space, ids);

  if (fold !== null) {
    element.on_hover((hovered, cx) => {
      state.onHover(space.id, hovered, cx);
    });
  }

  return element;
};

export const row = (spaceRow: SpaceRow, ids: readonly string[], state: RowState): Element => {
  const { space } = spaceRow;
  const line = dragLine(state.drag, space.id, ids);
  const pull = state.lookup(spaceRow.git);

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    start: spaceMark(spaceRow.status),
    label: rowTitle(spaceRow, state.lookup),
    cut: rowCut(space.named, pull),
    ...(line === undefined ? {} : { dropLine: line }),
    dragged: state.drag.source === space.id && state.drag.over !== space.id,
    end: pullDetail(spaceRow, state.lookup),
  }).id(`space-${space.id}`);

  state.attachDrag(element, space, ids);

  return element;
};
