// Go to a space. Opened by key, this copy starts the preview terminal and opens the picker: the
// list (this mod with props { part: "list" }) beside a live, watch-only view of the selected
// space (preview.sh). Then it closes itself.
//
// Type to fuzzy-search names, branches, folders, tabs, pane titles, and agents. The chips in the
// footer keep only what is in one state; Tab and shift+Tab cycle them, bound in keys.json. Up
// and down or ctrl+n and ctrl+p move, Enter goes, Esc closes. Holding ctrl+shift, k again moves
// to the next space, and releasing ctrl goes there, like alt-tab.

import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ModifiersChangedEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { InputState } from 'gpui-base';
import {
  h_flex,
  InputState as InputStates,
  v_flex,
  v_virtual_list,
  VirtualListScrollHandle,
} from 'gpui-base';
import type { Status } from 'herdr';
import {
  appHome,
  closeOverlay,
  exec,
  focused,
  hc,
  home,
  nextCommand,
  panes,
  props,
  run,
  setShared,
  shared,
  spaces,
} from 'herdr';

import {
  colors,
  emptyState,
  highlightedText,
  icon,
  iconSlot,
  listRow,
  modName,
  openAtTop,
  overlaySize,
  programIcon,
  radius,
  recordOf,
  rowHeight,
  searchField,
  spacing,
  statusMark,
  stringOf,
  textSize,
  toggleButton,
} from '../../kit/index.ts';
import { fuzzyMatch } from './match.ts';
import type { PickerData, PickerRow } from './rows.ts';
import { buildRows, folderName, rowPane, statusCount, tabLabel, tabPane } from './rows.ts';

interface StatusFilter {
  label: string;
  statuses: Status[] | null;
  mark: Status | null;
  empty: string;
}

const previewName = `${modName}-preview`;

const recentKey = `${modName}.recent`;

const focusKey = `${modName}.focus`;

const recentLimit = 50;

// The search input can't take the keyboard until the popup has drawn it, and a click on the
// preview terminal takes the keyboard away; both need another try, this often, this many times.
const focusRetryMilliseconds = 50;

const focusAttempts = 40;

const statusFilters: StatusFilter[] = [
  { label: 'All', statuses: null, mark: null, empty: 'No space matches.' },
  { label: 'Needs you', statuses: ['blocked', 'done'], mark: 'blocked', empty: 'Nothing needs you.' },
  { label: 'Blocked', statuses: ['blocked'], mark: 'blocked', empty: 'Nothing is blocked.' },
  { label: 'Done', statuses: ['done'], mark: 'done', empty: 'Nothing is done.' },
  { label: 'Working', statuses: ['working'], mark: 'working', empty: 'Nothing is working.' },
  { label: 'Idle', statuses: ['idle'], mark: 'idle', empty: 'Nothing is idle.' },
];

const allFilter = statusFilters[0] ?? { label: 'All', statuses: null, mark: null, empty: '' };

const previewFifo = (): string => `${home()}/.cache/herdr-${modName}.fifo`;

const previewScript = (): string => `${appHome()}/mods/${modName}/preview.sh`;

const isList = (): boolean => recordOf(props())['part'] === 'list';

const overlayId = (): string | null => stringOf(recordOf(props())['overlay']);

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const stringRecord = (value: unknown): Record<string, string> => {
  const entries = Object.entries(recordOf(value)).flatMap(([key, item]) =>
    typeof item === 'string' ? [[key, item] as const] : [],
  );

  return Object.fromEntries(entries);
};

const pickerData = (): PickerData => ({
  spaces: spaces(),
  panes: panes(),
  recent: stringList(shared(recentKey)),
  focus: stringRecord(shared(focusKey)),
});

// Herdr gives no history of pane focus, so the picker records the pane it was opened from and
// every pane it goes to, by tab id. Tabs that are gone are dropped.
const rememberPane = (tab: string, pane: string): void => {
  const tabs = new Set(spaces().flatMap((space) => space.tabs.map((item) => item.id)));
  const kept = Object.entries(stringRecord(shared(focusKey))).filter(([id]) => tabs.has(id));

  setShared(focusKey, { ...Object.fromEntries(kept), [tab]: pane });
};

const rememberSpace = (space: string): void => {
  const recent = stringList(shared(recentKey)).filter((saved) => saved !== space);

  setShared(recentKey, [space, ...recent].slice(0, recentLimit));
};

const livePreviewAddress = async (): Promise<string | null> => {
  const found = await hc(['get', '--json', previewName]).catch(() => null);

  if (found?.code === 0) {
    const terminal = recordOf(JSON.parse(found.stdout));

    if (terminal['state'] === 'live') {
      return stringOf(terminal['address']);
    }

    await hc(['rm', previewName]).catch(() => null);
  }

  const started = await hc([
    'run',
    '--bg',
    '--json',
    '--no-parent',
    '--name',
    previewName,
    '--',
    previewScript(),
    'serve',
    previewFifo(),
  ]);

  return started.code === 0 ? stringOf(recordOf(JSON.parse(started.stdout))['address']) : null;
};

const showInPreview = async (address: string | null): Promise<void> => {
  await exec(previewScript(), ['show', previewFifo(), address ?? '-']).catch(() => null);
};

// Opens like the command palette and Zed's pickers: a popup near the top of the window that
// leaves the window undimmed.
const openPicker = (previewAddress: string): void => {
  openAtTop(
    {
      width: overlaySize.pickerWidthShare,
      height: overlaySize.pickerHeightShare,
      layout: {
        type: 'row',
        divider: { width: spacing.hairline, color: 'border' },
        children: [
          {
            type: 'block',
            size: { px: overlaySize.pickerListWidth },
            content: { mod: modName, props: { part: 'list' } },
          },
          {
            type: 'block',
            padding: overlaySize.pickerInset,
            content: { terminal: previewAddress },
          },
        ],
      },
    },
    overlaySize.topOffset,
  );
};

// Without a preview terminal, Herdr's own picker still gets you somewhere.
const launch = (cx: AsyncContext): void => {
  const overlay = overlayId();
  const here = focused();

  if (here?.pane !== null && here?.pane !== undefined) {
    rememberPane(here.tab, here.pane);
  }

  cx.spawn(async () => {
    const previewAddress = await livePreviewAddress().catch(() => null);

    if (overlay !== null) {
      closeOverlay(overlay);
    }

    if (previewAddress === null) {
      run('mod.open', { name: 'picker' });
    } else {
      openPicker(previewAddress);
    }
  });
};

const controlKey = (event: KeyEvent, letter: string): boolean =>
  event.modifiers.control && event.key === letter;

const rowState = (selected: boolean): 'selected' | 'normal' => (selected ? 'selected' : 'normal');

export default class Picker extends View {
  private query = '';

  private filterIndex = 0;

  private cycled = false;

  private selectedKey: string | null = null;

  private wantedPreview: string | null = null;

  // undefined until the first write, so the first selection always reaches the preview.
  private shownPreview: string | null | undefined = undefined;

  private writingPreview = false;

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
        launch(cx);
      }

      return;
    }

    const current = focused()?.space ?? null;

    if (current !== null) {
      rememberSpace(current);
    }

    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value().trim();
      this.selectFirst(changeCx);
    });

    this.input.on('submit', () => {
      this.go(this.selectedRow());
    });

    this.keepSearchFocused(cx);

    const rows = this.rows();
    const previous = rows.find((row) => row.kind === 'space' && row.space.id !== current) ?? rows[0];

    this.selectedKey = previous?.key ?? null;
    this.updatePreview(cx);
    this.listenForCommands(cx);
  }

  override async close(): Promise<void> {
    if (isList()) {
      await showInPreview(null);
    }
  }

  override render(): Element {
    if (!isList()) {
      return div();
    }

    const palette = colors();
    const rows = this.rows();
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
      .child(rows.length > 0 ? this.list(rows) : div().flex_1().child(emptyState(emptyText)))
      .child(this.footer());

    return this.handle === null ? picker : picker.track_focus(this.handle);
  }

  private filter(): StatusFilter {
    return statusFilters[this.filterIndex] ?? allFilter;
  }

  private rows(): PickerRow[] {
    return buildRows(this.query, this.filter().statuses, pickerData());
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

        if (command.endsWith('filter-next')) {
          this.changeStatusFilter(this.filterIndex + 1, taskCx);
        } else if (command.endsWith('filter-previous')) {
          this.changeStatusFilter(this.filterIndex - 1, taskCx);
        } else if (command.endsWith('next')) {
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
    this.selectedKey = this.rows()[0]?.key ?? null;
    this.scroll.scroll_to_item(0);
    this.updatePreview(cx);
    cx.notify();
  }

  private selectedRow(): PickerRow | undefined {
    const rows = this.rows();

    return rows.find((row) => row.key === this.selectedKey) ?? rows[0];
  }

  private selectedIndex(rows: PickerRow[]): number {
    return Math.max(
      0,
      rows.findIndex((row) => row.key === this.selectedKey),
    );
  }

  private move(step: number, cx: Context): void {
    const rows = this.rows();

    if (rows.length === 0) {
      return;
    }

    this.select(rows, (this.selectedIndex(rows) + step + rows.length) % rows.length, cx);
  }

  // Like alt-tab, cycling goes from space to space, past their tab and pane rows.
  private moveToNextSpace(cx: Context): void {
    const rows = this.rows();
    const index = this.selectedIndex(rows);
    const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
    const nextSpace = ordered.find((row) => row.kind === 'space');

    if (nextSpace !== undefined) {
      this.select(rows, rows.indexOf(nextSpace), cx);
    }
  }

  private select(rows: PickerRow[], index: number, cx: Context): void {
    this.selectedKey = rows[index]?.key ?? null;
    this.scroll.scroll_to_item(index);
    this.updatePreview(cx);
    cx.notify();
  }

  // One write at a time, always of the latest selection, so fast moves can't reach the preview
  // out of order.
  private updatePreview(cx: Context): void {
    this.wantedPreview = rowPane(this.selectedRow(), pickerData())?.terminal ?? null;

    if (this.writingPreview) {
      return;
    }

    this.writingPreview = true;

    cx.spawn(async () => {
      while (this.shownPreview !== this.wantedPreview) {
        const address = this.wantedPreview;

        // eslint-disable-next-line no-await-in-loop -- writes go one at a time, in order
        await showInPreview(address);
        this.shownPreview = address;
      }

      this.writingPreview = false;
    });
  }

  private closePicker(): void {
    const overlay = overlayId();

    this.leaving = true;

    if (overlay !== null) {
      closeOverlay(overlay);
    }
  }

  private go(row: PickerRow | undefined): void {
    if (row === undefined) {
      return;
    }

    const pane = rowPane(row, pickerData());

    this.closePicker();
    rememberSpace(row.space.id);

    if (row.kind === 'space' || row.tab === undefined) {
      run('space.select', { id: row.space.id });
    } else {
      run('tab.select', { id: row.tab.id });
    }

    if (pane === null || row.tab === undefined) {
      return;
    }

    rememberPane(row.tab.id, pane.pane);
    run('pane.focus', { pane: pane.pane });
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
      this.go(this.selectedRow());
    }
  }

  private spaceRow(row: PickerRow, selected: boolean): Element {
    const { space } = row;
    const nameMatch = this.query === '' ? null : fuzzyMatch(this.query, space.name);
    const label = nameMatch === null ? space.name : highlightedText(space.name, nameMatch.positions, true);

    return listRow({
      size: 'large',
      inset: true,
      state: rowState(selected),
      start: iconSlot(icon('folder').text_color(colors().dim)),
      label,
      ...(space.branch === null || space.branch === '' ? {} : { detail: space.branch }),
      end: [statusMark(space.status)],
    });
  }

  private tabRow(row: PickerRow, selected: boolean, data: PickerData): Element {
    const tab = row.tab;

    if (tab === undefined) {
      return div();
    }

    const program = tabPane(tab, data)?.program ?? null;

    return listRow({
      size: 'large',
      inset: true,
      state: rowState(selected),
      depth: 1,
      start: programIcon(program).text_color(colors().dim),
      label: tabLabel(tab, data.panes),
      muted: !tab.active,
      end: [statusMark(tab.status)],
    });
  }

  private paneRow(row: PickerRow, selected: boolean): Element {
    const pane = row.pane;

    if (pane === null) {
      return div();
    }

    const place = [folderName(pane.cwd), pane.branch ?? ''].filter(Boolean).join(' · ');

    return listRow({
      size: 'large',
      inset: true,
      state: rowState(selected),
      depth: row.space.tabs.length > 1 ? 2 : 1,
      start: programIcon(pane.program).text_color(colors().dim),
      label: `${pane.program.name} · ${pane.title}`,
      muted: !pane.focused,
      ...(place === '' ? {} : { detail: place }),
      end: [statusMark(pane.status)],
    });
  }

  private rowElement(row: PickerRow, data: PickerData): Element {
    const selected = row.key === this.selectedKey;

    if (row.kind === 'space') {
      return this.spaceRow(row, selected);
    }

    return row.kind === 'tab' ? this.tabRow(row, selected, data) : this.paneRow(row, selected);
  }

  private list(rows: PickerRow[]): Element {
    const data = pickerData();

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
        this.go(rows.find((row) => row.key === key));
      });
  }

  private filterChip(filter: StatusFilter, index: number): Element {
    const active = index === this.filterIndex;
    const count = filter.statuses === null ? null : statusCount(filter.statuses, panes());

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

  private footer(): Element {
    return h_flex()
      .flex_none()
      .p(spacing.xsmall)
      .gap(spacing.xxsmall)
      .overflow_hidden()
      .border_t(spacing.hairline)
      .border_color(colors().border)
      .children(statusFilters.map((filter, index) => this.filterChip(filter, index)));
  }
}
