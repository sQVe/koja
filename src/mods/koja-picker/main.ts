import type { InputState } from 'gpui-base';
import { InputState as InputStates, VirtualListScrollHandle, v_flex } from 'gpui-base';
import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ModifiersChangedEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { focused, nextCommand, run } from 'herdr';

import {
  closeOverlay,
  colors,
  modName,
  overlayId,
  radius,
  recordOverlayClose,
  repeat,
  searchField,
  stateLine,
  withTextRole,
} from '../../kit/index.ts';
import type { StatusFilter } from './filters.ts';
import { allFilter, statusFilters } from './filters.ts';
import { footer as statusFooter } from './footer.ts';
import { launch } from './launch.ts';
import { history, isList, pickerData, previewFromProps } from './pickerData.ts';
import type { PreviewSession } from './previewLifecycle.ts';
import { heartbeatIntervalMilliseconds } from './previewLifecycle.ts';
import { createPreviewSession } from './previewSession.ts';
import { list as virtualList } from './rowElements.ts';
import type { PickerData, PickerRow } from './rows.ts';
import { buildRows, rowPane } from './rows.ts';
import { keepSearchFocused } from './searchFocus.ts';

const controlKey = (event: KeyEvent, letter: string): boolean =>
  event.modifiers.control && event.key === letter;

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

    keepSearchFocused(
      {
        input: this.input,
        isSearchFocused: () => this.searchFocused,
        setSearchFocused: (next) => {
          this.searchFocused = next;
        },
        isLeaving: () => this.leaving,
      },
      cx,
    );

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
    const empty = stateLine({ kind: 'empty', text: emptyText });

    const picker = withTextRole(v_flex(), 'body')
      .id(modName)
      .size_full()
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
      .child(rows.length > 0 ? this.list(rows, data) : div().flex_1().child(empty))
      .child(this.footer(data));

    return this.handle === null ? picker : picker.track_focus(this.handle);
  }

  private filter(): StatusFilter {
    return statusFilters[this.filterIndex] ?? allFilter;
  }

  private rowsFrom(data: PickerData): PickerRow[] {
    return buildRows(this.query, this.filter().statuses, data);
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

  private list(rows: PickerRow[], data: PickerData): Element {
    return virtualList(rows, this.query, this.selectedKey, data, this.scroll, (key) => {
      const fresh = pickerData();
      const freshRows = this.rowsFrom(fresh);

      this.go(
        freshRows.find((row) => row.key === key),
        fresh,
      );
    });
  }

  private footer(data: PickerData): Element {
    return statusFooter(this.filterIndex, data, (index, cx) => {
      this.changeStatusFilter(index, cx);
    });
  }
}
