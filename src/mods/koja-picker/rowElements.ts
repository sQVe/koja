import type { VirtualListScrollHandle } from 'gpui-base';
import { v_virtual_list } from 'gpui-base';
import type { Element } from 'gpui-kit';

import {
  colors,
  emptyWorkSlot,
  factLine,
  highlightedText,
  listRow,
  modName,
  programIcon,
  rowHeight,
  spaceMark,
  spacing,
  statusMark,
  workIcon,
} from '../../kit/index.ts';
import { fuzzyMatch } from './match.ts';
import type { PanePickerRow, PickerData, PickerRow, TabPickerRow } from './rows.ts';
import { paneDetail, paneLabel, tabRowDisplay } from './rows.ts';
import type { StackReason } from './stackSearch.ts';

type SpaceRow = Extract<PickerRow, { kind: 'space' }>;

const rowState = (selected: boolean): 'selected' | 'normal' => (selected ? 'selected' : 'normal');

const reasonFacts = (reason: StackReason): string[] => {
  const facts = [`PR ${reason.position} of ${reason.total}`];

  if (reason.state !== null) {
    facts.push(reason.state);
  }

  return facts;
};

const spaceEnd = (reason: StackReason | null, workSlot: Element): Element[] => {
  if (reason === null) {
    return [workSlot];
  }

  return [factLine(reason.value, reasonFacts(reason)), workSlot];
};

const spaceRow = (row: SpaceRow, selected: boolean, query: string, data: PickerData): Element => {
  const { space } = row;
  const nameMatch = query === '' ? null : fuzzyMatch(query, space.name);

  const label =
    nameMatch === null ? space.name : highlightedText(space.name, nameMatch.positions, true);

  const facts = data.facts[space.id];
  const project = facts?.project ?? null;
  const need = facts?.need ?? null;
  const workSlot = need === null ? emptyWorkSlot() : workIcon(need);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    start: spaceMark(data.statuses.spaces[space.id] ?? null),
    label,
    ...(project === null ? {} : { detail: project }),
    end: spaceEnd(row.reason, workSlot),
  });
};

const tabRow = (row: TabPickerRow, selected: boolean, data: PickerData): Element => {
  const { tab } = row;

  const { program, label } = tabRowDisplay(tab, data.panes, data.terminals);

  const programMark = programIcon(program ?? null).text_color(colors().dim);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    depth: 1,
    start: programMark,
    label,
    muted: !tab.active,
    end: [statusMark(data.statuses.tabs[tab.id] ?? null)],
  });
};

const paneRow = (row: PanePickerRow, selected: boolean): Element => {
  const { pane } = row;
  const detail = paneDetail(pane);

  const depth = row.tabRowShown ? 2 : 1;
  const programMark = programIcon(pane.program).text_color(colors().dim);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    depth,
    start: programMark,
    label: paneLabel(pane),
    muted: !pane.focused,
    ...(detail === null ? {} : { detail }),
    end: [statusMark(pane.status ?? null)],
  });
};

const rowElement = (
  row: PickerRow,
  query: string,
  selectedKey: string | null,
  data: PickerData,
): Element => {
  const selected = row.key === selectedKey;

  if (row.kind === 'space') {
    return spaceRow(row, selected, query, data);
  }

  return row.kind === 'tab' ? tabRow(row, selected, data) : paneRow(row, selected);
};

export const list = (
  rows: PickerRow[],
  query: string,
  selectedKey: string | null,
  data: PickerData,
  scroll: VirtualListScrollHandle,
  onItemClick: (key: string) => void,
): Element => {
  return v_virtual_list(
    `${modName}-rows`,
    rows.length,
    rowHeight.large,
    (index) => rows[index]?.key ?? String(index),
    (range) =>
      rows.slice(range.start, range.end).map((row) => rowElement(row, query, selectedKey, data)),
  )
    .track_scroll(scroll)
    .flex_1()
    .py(spacing.xsmall)
    .on_item_click((key) => {
      onItemClick(key);
    });
};
