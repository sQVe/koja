import type { InputState } from 'gpui-base';
import {
  h_flex,
  InputState as InputStates,
  v_flex,
  v_virtual_list,
  VirtualListScrollHandle,
} from 'gpui-base';
import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ModifiersChangedEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import {
  focused,
  nextCommand,
  panes,
  props,
  run,
  setShared,
  shared,
  spaces,
  terminals,
} from 'herdr';

import {
  closeOverlay,
  colors,
  emptyState,
  highlightedText,
  icon,
  iconSlot,
  listRow,
  modName,
  overlayId,
  programIcon,
  radius,
  recordOf,
  recordOverlayClose,
  repeat,
  rollupStatuses,
  rowHeight,
  searchField,
  spacing,
  statusMark,
  stringOf,
  textSize,
  toggleButton,
} from '../../kit/index.ts';
import type { StatusFilter } from './filters.ts';
import { allFilter, statusFilters } from './filters.ts';
import { createHistory } from './history.ts';
import { launch } from './launch.ts';
import { fuzzyMatch } from './match.ts';
import type { PreviewSession } from './previewLifecycle.ts';
import { heartbeatIntervalMilliseconds } from './previewLifecycle.ts';
import { createPreviewSession, resumePreviewSession } from './previewSession.ts';
import type { PanePickerRow, PickerData, PickerRow, TabPickerRow } from './rows.ts';
import { buildRows, paneDetail, paneLabel, rowPane, statusCount, tabRowDisplay } from './rows.ts';

const history = createHistory(
  {
    get: (key) => shared(key),
    set: (key, value) => {
      setShared(key, value);
    },
    liveTabs: () => new Set(spaces().flatMap((space) => space.tabs.map((tab) => tab.id))),
  },
  { recent: `${modName}.recent`, focus: `${modName}.focus` },
);

// The search input can't take the keyboard until the popup has drawn it, and a click on the
// preview terminal takes the keyboard away; both need another try, this often, this many times.
const focusRetryMilliseconds = 50;

const focusAttempts = 40;

const isList = (): boolean => recordOf(props())['part'] === 'list';

const pickerData = (): PickerData => {
  const spaceList = spaces();
  const paneList = panes();
  const terminalList = terminals();

  return {
    spaces: spaceList,
    panes: paneList,
    terminals: terminalList,
    statuses: rollupStatuses(spaceList, paneList, terminalList),
    recent: history.recent(),
    focus: history.focus(),
  };
};

const controlKey = (event: KeyEvent, letter: string): boolean =>
  event.modifiers.control && event.key === letter;

const rowState = (selected: boolean): 'selected' | 'normal' => (selected ? 'selected' : 'normal');

const previewFromProps = (): PreviewSession | null => {
  const preview = recordOf(recordOf(props())['preview']);
  const folder = stringOf(preview['folder']);
  const statePath = stringOf(preview['state']);
  const viewer = stringOf(preview['viewer']);

  if (folder === null || statePath === null || viewer === null) {
    return null;
  }

  return resumePreviewSession({ address: viewer, folder, statePath });
};

export default class Picker extends View {
  private query = '';

  private filterIndex = 0;

  private cycled = false;

  private selectedKey: string | null = null;

  private preview: PreviewSession | null = null;

  private searchFocused = false;

  private leaving = false;

  private handle: FocusHandle | null = null;

  private readonly scroll = VirtualListScrollHandle.new();

  private readonly input: InputState = InputStates.new({
    placeholder: 'Go to a space, tab or pane…',
  });

  override init(_props: unknown, cx: AsyncContext): void {
    if (!isList()) {
      if (overlayId() !== null) {
        this.preview = createPreviewSession();
        launch(cx, this.preview, history.rememberPane);
      }

      return;
    }

    this.preview = previewFromProps();
    this.watchPreview(cx);

    const current = focused()?.space ?? null;

    if (current !== null) {
      history.rememberSpace(current);
    }

    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value().trim();
      this.selectFirst(changeCx);
    });

    this.input.on('submit', () => {
      const data = pickerData();

      this.go(this.selectedRow(this.rowsFrom(data)), data);
    });

    this.keepSearchFocused(cx);

    const data = pickerData();
    const rows = this.rowsFrom(data);

    const previous =
      rows.find((row) => row.kind === 'space' && row.space.id !== current) ?? rows[0];

    this.selectedKey = previous?.key ?? null;
    this.updatePreview(previous, data);
    this.listenForCommands(cx);
  }

  override close(): void {
    recordOverlayClose();
    this.preview?.close();
  }

  private watchPreview(cx: AsyncContext): void {
    const preview = this.preview;

    if (preview === null) {
      return;
    }

    preview.beat().catch(() => undefined);

    repeat(cx, heartbeatIntervalMilliseconds, () => {
      preview.beat().catch(() => undefined);
    });
  }

  override render(): Element {
    if (!isList()) {
      return div();
    }

    const palette = colors();
    const data = pickerData();
    const rows = this.rowsFrom(data);
    const emptyText = this.query === '' ? this.filter().empty : 'No space matches.';

    const picker = v_flex()
      .id(modName)
      .size_full()
      .text_size(textSize.default)
      .bg(palette.popover)
      .rounded_tl(radius.dialog)
      .rounded_bl(radius.dialog)
      .on_key_down((event, cx) => {
        this.onKey(event, cx);
      })
      .on_modifiers_changed((event) => {
        this.onModifiersChanged(event);
      })
      .child(searchField(this.input, 'search'))
      .child(rows.length > 0 ? this.list(rows, data) : div().flex_1().child(emptyState(emptyText)))
      .child(this.footer(data));

    return this.handle === null ? picker : picker.track_focus(this.handle);
  }

  private filter(): StatusFilter {
    return statusFilters[this.filterIndex] ?? allFilter;
  }

  private rowsFrom(data: PickerData): PickerRow[] {
    return buildRows(this.query, this.filter().statuses, data);
  }

  private keepSearchFocused(cx: AsyncContext): void {
    this.input.on('focus', () => {
      this.searchFocused = true;
    });

    this.input.on('blur', () => {
      this.searchFocused = false;
      this.focusSearch(cx, focusAttempts);
    });

    this.focusSearch(cx, focusAttempts);
  }

  private focusSearch(cx: AsyncContext, attemptsLeft: number): void {
    if (this.searchFocused || this.leaving || attemptsLeft === 0) {
      return;
    }

    this.input.focus();

    cx.timer.after(focusRetryMilliseconds, (timerCx) => {
      this.focusSearch(timerCx, attemptsLeft - 1);
    });
  }

  private listenForCommands(cx: AsyncContext): void {
    cx.spawn(async (taskCx) => {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- each key command is awaited in turn
        const command = await nextCommand();

        if (command === 'filter-next') {
          this.changeStatusFilter(this.filterIndex + 1, taskCx);
        } else if (command === 'filter-previous') {
          this.changeStatusFilter(this.filterIndex - 1, taskCx);
        } else if (command === 'next') {
          this.cycled = true;
          this.moveToNextSpace(taskCx);
        }
      }
    });
  }

  private changeStatusFilter(index: number, cx: Context): void {
    this.filterIndex = (index + statusFilters.length) % statusFilters.length;
    this.selectFirst(cx);
  }

  private selectFirst(cx: Context): void {
    const data = pickerData();
    const rows = this.rowsFrom(data);

    this.selectedKey = rows[0]?.key ?? null;
    this.scroll.scroll_to_item(0);
    this.updatePreview(rows[0], data);
    cx.notify();
  }

  private selectedRow(rows: PickerRow[]): PickerRow | undefined {
    return rows.find((row) => row.key === this.selectedKey) ?? rows[0];
  }

  private selectedIndex(rows: PickerRow[]): number {
    return Math.max(
      0,
      rows.findIndex((row) => row.key === this.selectedKey),
    );
  }

  private move(step: number, cx: Context): void {
    const data = pickerData();
    const rows = this.rowsFrom(data);

    if (rows.length === 0) {
      return;
    }

    const index = (this.selectedIndex(rows) + step + rows.length) % rows.length;

    this.select(rows, index, data, cx);
  }

  private moveToNextSpace(cx: Context): void {
    const data = pickerData();
    const rows = this.rowsFrom(data);
    const index = this.selectedIndex(rows);
    const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
    const nextSpace = ordered.find((row) => row.kind === 'space');

    if (nextSpace !== undefined) {
      this.select(rows, rows.indexOf(nextSpace), data, cx);
    }
  }

  private select(rows: PickerRow[], index: number, data: PickerData, cx: Context): void {
    this.selectedKey = rows[index]?.key ?? null;
    this.scroll.scroll_to_item(index);
    this.updatePreview(rows[index], data);
    cx.notify();
  }

  private updatePreview(row: PickerRow | undefined, data: PickerData): void {
    this.preview?.show(rowPane(row, data)?.terminal ?? null);
  }

  private closePicker(): void {
    this.leaving = true;
    recordOverlayClose();
    closeOverlay();
  }

  private go(row: PickerRow | undefined, data: PickerData): void {
    if (row === undefined) {
      return;
    }

    const pane = rowPane(row, data);

    this.closePicker();
    history.rememberSpace(row.space.id);

    if (row.kind === 'space') {
      run('space.select', { id: row.space.id });

      if (row.tab === undefined || pane === null) {
        return;
      }

      this.focusPane(row.tab.id, pane.pane);

      return;
    }

    run('tab.select', { id: row.tab.id });

    if (pane !== null) {
      this.focusPane(row.tab.id, pane.pane);
    }
  }

  private focusPane(tab: string, pane: string): void {
    history.rememberPane(tab, pane);
    run('pane.focus', { pane });
  }

  private onKey(event: KeyEvent, cx: Context): void {
    const { key } = event;

    if (key === 'escape') {
      this.closePicker();
    } else if (key === 'down' || controlKey(event, 'n')) {
      this.move(1, cx);
    } else if (key === 'up' || controlKey(event, 'p')) {
      this.move(-1, cx);
    } else {
      return;
    }

    cx.stop_propagation();
  }

  private onModifiersChanged(event: ModifiersChangedEvent): void {
    if (this.cycled && !event.modifiers.control) {
      const data = pickerData();

      this.go(this.selectedRow(this.rowsFrom(data)), data);
    }
  }

  private spaceRow(row: PickerRow, selected: boolean, data: PickerData): Element {
    const { space } = row;
    const nameMatch = this.query === '' ? null : fuzzyMatch(this.query, space.name);

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
  }

  private tabRow(row: TabPickerRow, selected: boolean, data: PickerData): Element {
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
  }

  private paneRow(row: PanePickerRow, selected: boolean): Element {
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
  }

  private rowElement(row: PickerRow, data: PickerData): Element {
    const selected = row.key === this.selectedKey;

    if (row.kind === 'space') {
      return this.spaceRow(row, selected, data);
    }

    return row.kind === 'tab' ? this.tabRow(row, selected, data) : this.paneRow(row, selected);
  }

  private list(rows: PickerRow[], data: PickerData): Element {
    return v_virtual_list(
      `${modName}-rows`,
      rows.length,
      rowHeight.large,
      (index) => rows[index]?.key ?? String(index),
      (range) => rows.slice(range.start, range.end).map((row) => this.rowElement(row, data)),
    )
      .track_scroll(this.scroll)
      .flex_1()
      .py(spacing.xsmall)
      .on_item_click((key) => {
        const fresh = pickerData();
        const freshRows = this.rowsFrom(fresh);

        this.go(
          freshRows.find((row) => row.key === key),
          fresh,
        );
      });
  }

  private filterCount(filter: StatusFilter, data: PickerData): number | null {
    if (filter.statuses === null) {
      return null;
    }

    return statusCount(filter.statuses, data.spaces, data.statuses);
  }

  private filterChip(filter: StatusFilter, index: number, data: PickerData): Element {
    const active = index === this.filterIndex;
    const count = this.filterCount(filter, data);

    return toggleButton({
      label: filter.label,
      active,
      quiet: count === 0 && !active,
      ...(filter.mark === null ? {} : { start: statusMark(filter.mark) }),
      ...(count === null || count === 0 ? {} : { end: String(count) }),
    })
      .id(`${modName}-filter-${index}`)
      .on_click((_event, cx) => {
        this.changeStatusFilter(index, cx);
      });
  }

  private footer(data: PickerData): Element {
    return h_flex()
      .flex_none()
      .p(spacing.xsmall)
      .gap(spacing.xxsmall)
      .overflow_hidden()
      .border_t(spacing.hairline)
      .border_color(colors().border)
      .children(statusFilters.map((filter, index) => this.filterChip(filter, index, data)));
  }
}
