import type { VirtualListScrollHandle } from 'gpui-base';
import { v_virtual_list } from 'gpui-base';
import type { Element } from 'gpui-kit';

import {
  colors,
  highlightedText,
  icon,
  iconSlot,
  listRow,
  modName,
  programIcon,
  rowHeight,
  spacing,
  statusMark,
} from '../../kit/index.ts';
import { fuzzyMatch } from './match.ts';
import type { PanePickerRow, PickerData, PickerRow, TabPickerRow } from './rows.ts';
import { paneDetail, paneLabel, tabRowDisplay } from './rows.ts';

const rowState = (selected: boolean): 'selected' | 'normal' => (selected ? 'selected' : 'normal');

const spaceRow = (row: PickerRow, selected: boolean, query: string, data: PickerData): Element => {
  const { space } = row;
  const nameMatch = query === '' ? null : fuzzyMatch(query, space.name);

  const label =
    nameMatch === null ? space.name : highlightedText(space.name, nameMatch.positions, true);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    start: iconSlot(icon('folder').text_color(colors().dim)),
    label,
    ...(space.branch === null || space.branch === '' ? {} : { detail: space.branch }),
    end: [statusMark(data.statuses.spaces[space.id] ?? null)],
  });
};

const tabRow = (row: TabPickerRow, selected: boolean, data: PickerData): Element => {
  const { tab } = row;

  const { program, label } = tabRowDisplay(tab, data.panes, data.terminals);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    depth: 1,
    start: programIcon(program ?? null).text_color(colors().dim),
    label,
    muted: !tab.active,
    end: [statusMark(data.statuses.tabs[tab.id] ?? null)],
  });
};

const paneRow = (row: PanePickerRow, selected: boolean): Element => {
  const { pane } = row;
  const detail = paneDetail(pane);

  return listRow({
    size: 'large',
    inset: true,
    state: rowState(selected),
    depth: row.space.tabs.length > 1 ? 2 : 1,
    start: programIcon(pane.program).text_color(colors().dim),
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
