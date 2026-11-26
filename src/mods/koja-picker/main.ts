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
import { checking, focused, nextCommand, run, setShared, shared } from 'herdr';

import { createContextKeys } from '../../kit/contextKeys.ts';
import {
  closeOverlay,
  colors,
  modName,
  overlayId,
  popupFrameRadius,
  recordOverlayClose,
  repeat,
  searchField,
  sectionHeader,
  stateLine,
  withTextRole,
} from '../../kit/index.ts';
import { recordSpaceSelection, runSpaceCommand } from '../../kit/space/spaceSelection.ts';
import { chips } from './chips.ts';
import type { StatusFilter } from './filters.ts';
import { allFilter, statusFilters } from './filters.ts';
import { footer } from './footer.ts';
import { launch } from './launch.ts';
import { history, pickerData, pickerPart, previewFromProps } from './pickerData.ts';
import { previewError } from './previewError.ts';
import { previewHeader, previewTargetOf } from './previewHeader.ts';
import type { PreviewSession } from './previewLifecycle.ts';
import { heartbeatIntervalMilliseconds } from './previewLifecycle.ts';
import { createPreviewSession } from './previewSession.ts';
import { list as virtualList } from './rowElements.ts';
import type { PickerData, PickerRow } from './rows.ts';
import { buildRows, rowPane } from './rows.ts';
import { keepSearchFocused } from './searchFocus.ts';
import { readSelection, writeSelection } from './selection.ts';

const filterKeys = createContextKeys('KojaPicker', [
  { keystroke: 'tab', action: 'koja-picker-filter-next' },
  { keystroke: 'shift-tab', action: 'koja-picker-filter-previous' },
]);

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

  private retrying = false;

  private handle: FocusHandle | null = null;

  private readonly scroll = VirtualListScrollHandle.new();

  private readonly input: InputState = InputStates.new({
    placeholder: 'Go to a space, tab or pane',
  });

  override init(_props: unknown, cx: AsyncContext): void {
    const part = pickerPart();

    if (part !== null && part !== 'list') {
      return;
    }

    if (part === null) {
      this.startPreview(cx);

      return;
    }

    filterKeys.bind(cx);
    this.preview = checking() ? null : previewFromProps();
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
    const part = pickerPart();

    if (part === null || part === 'list') {
      recordOverlayClose();
      this.forgetSelection();
    }

    this.preview?.close();
  }

  private forgetSelection(): void {
    const overlay = overlayId();

    if (overlay !== null) {
      writeSelection(overlay, null);
    }
  }

  private startPreview(cx: Context, onSettled: () => void = () => undefined): boolean {
    if (checking() || overlayId() === null) {
      return false;
    }

    this.preview = createPreviewSession();

    const session = this.preview;

    launch(cx, session, history.rememberPane, onSettled);

    return true;
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
    const part = pickerPart();

    if (part === 'preview-header') {
      return this.header();
    }

    if (part === 'preview-error') {
      return this.error();
    }

    if (part === 'footer') {
      return footer();
    }

    return part === 'list' ? this.picker() : div();
  }

  private header(): Element {
    const overlay = overlayId();
    const selected = overlay === null ? null : readSelection(overlay);

    return previewHeader(previewTargetOf(pickerData(), selected));
  }

  private error(): Element {
    return previewError({
      enabled: !this.retrying,
      onRetry: (cx) => {
        this.retry(cx);
      },
    });
  }

  private retry(cx: Context): void {
    if (this.retrying) {
      return;
    }

    this.retrying = true;

    const started = this.startPreview(cx, () => {
      this.retrying = false;
    });

    if (!started) {
      this.retrying = false;
    }

    cx.notify();
  }

  private picker(): Element {
    const palette = colors();
    const data = pickerData();
    const rows = this.rowsFrom(data);

    this.reconcileSelection(rows, data);

    const empty = stateLine({ kind: 'empty', text: this.emptyText(), wrap: true });

    const body = rows.length > 0 ? this.rows(rows, data) : div().flex_1().child(empty);

    const picker = withTextRole(v_flex(), 'body')
      .id(modName)
      .size_full()
      .bg(palette.popover)
      .rounded_tl(popupFrameRadius)
      .rounded_bl(popupFrameRadius)
      .on_key_down((event, cx) => {
        this.onKey(event, cx);
      })
      .on_modifiers_changed((event) => {
        this.onModifiersChanged(event);
      })
      .child(searchField(this.input, 'search'))
      .child(
        chips(this.filterIndex, data, (index, cx) => {
          this.changeStatusFilter(index, cx);
        }),
      )
      .child(sectionHeader({ label: 'Spaces', size: 'default' }))
      .child(body);

    const root = filterKeys.withKeys(picker, (key, cx) => {
      const step = key === 'tab' ? 1 : -1;

      this.changeStatusFilter(this.filterIndex + step, cx);
    });

    return this.handle === null ? root : root.track_focus(this.handle);
  }

  private filter(): StatusFilter {
    return statusFilters[this.filterIndex] ?? allFilter;
  }

  private emptyText(): string {
    const filter = this.filter();

    if (this.query === '' || filter === allFilter) {
      return filter.empty;
    }

    return `Nothing in ${filter.label} matches "${this.query}".`;
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

  // Live data can move the selected row to another pane without a selection action, so the header,
  // the preview, and Enter all follow the pane the row resolves to now, and the row stays marked.
  private reconcileSelection(rows: PickerRow[], data: PickerData): void {
    const row = this.selectedRow(rows);
    const overlay = overlayId();

    if (overlay === null) {
      return;
    }

    if ((rowPane(row, data)?.pane ?? null) === readSelection(overlay)) {
      this.selectedKey = row?.key ?? this.selectedKey;

      return;
    }

    this.selectedKey = row?.key ?? null;
    this.updatePreview(row, data);
  }

  private updatePreview(row: PickerRow | undefined, data: PickerData): void {
    const pane = rowPane(row, data);
    const overlay = overlayId();

    this.preview?.show(pane?.terminal ?? null);

    if (overlay !== null) {
      writeSelection(overlay, pane?.pane ?? null);
    }
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
    const selection = { run, get: shared, set: setShared, shown: () => focused()?.space ?? null };

    this.closePicker();
    history.rememberSpace(row.space.id);

    if (row.kind === 'space') {
      runSpaceCommand(selection, { name: 'space.select', args: { id: row.space.id } });

      if (row.tab === undefined || pane === null) {
        return;
      }

      this.focusPane(row.tab.id, pane.pane);

      return;
    }

    recordSpaceSelection(selection, row.space.id);

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

  private rows(rows: PickerRow[], data: PickerData): Element {
    return virtualList(rows, this.query, this.selectedKey, data, this.scroll, (key) => {
      const fresh = pickerData();
      const freshRows = this.rowsFrom(fresh);

      this.go(
        freshRows.find((row) => row.key === key),
        fresh,
      );
    });
  }
}
