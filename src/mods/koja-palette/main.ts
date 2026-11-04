import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ScrollWheelEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { commands, layouts, shared } from 'herdr';

import {
  askFirst,
  closeOverlay,
  currentWindow,
  detailText,
  emptyState,
  highlightedText,
  keyHint,
  listRow,
  openPrompt,
  popupSurface,
  recordOverlayClose,
  searchField,
  sectionHeader,
  shortcutFor,
  spacing,
  stringOf,
  themeChoices,
} from '../../kit/index.ts';
import type { Entry, Row } from './entries.ts';
import { allEntries, entryShortcut, paletteRows } from './entries.ts';
import type { RowPlace } from './viewport.ts';
import {
  clampIndex,
  listHeight,
  maxScroll,
  placesOf,
  rowAt,
  rowSize,
  scrollToShow,
  shownRows,
  totalHeight,
  visible,
  wheelFrom,
} from './viewport.ts';

const recentLimit = 20;

// A refocus after the popup has drawn, when the input can take the keyboard.
const refocusMilliseconds = 600;

const recentStorageKey = 'recent';

const readRecent = (): string[] => {
  const stored: unknown = JSON.parse(localStorage.getItem(recentStorageKey) ?? '[]');

  return Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === 'string')
    : [];
};

export default class Palette extends View {
  private query = '';

  private at = 0;

  private scroll = 0;

  private recent = readRecent();

  private readonly input: InputState = InputStates.new({ placeholder: 'Type a command…' });

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value();
      this.at = 0;
      changeCx.notify();
    });

    this.input.on('submit', () => {
      this.go(rowAt(this.rows(), this.at)?.entry);
    });

    this.input.focus();

    cx.timer.after(refocusMilliseconds, () => {
      this.input.focus();
    });
  }

  override close(): void {
    recordOverlayClose();
  }

  override render(): Element {
    const rows = this.rows();
    const grouped = this.query === '';

    const places = placesOf(
      rows.map((row) => row.head),
      grouped,
    );

    const max = maxScroll(places);
    const scrolls = totalHeight(places) > listHeight;
    const at = clampIndex(this.at, rows.length);
    const scroll = scrollToShow(places, at, this.scroll, max);

    const palette = popupSurface('palette')
      .on_key_down((event, cx) => {
        this.onKey(event, rows, places, cx);
      })
      .child(searchField(this.input, 'command'))
      .child(
        rows.length > 0 ? this.list(rows, places, scrolls, at, scroll) : this.nothingMatches(),
      );

    return this.handle === null ? palette : palette.track_focus(this.handle);
  }

  private go(entry: Entry | undefined): void {
    if (entry === undefined) {
      return;
    }

    this.recent = [entry.id, ...this.recent.filter((id) => id !== entry.id)].slice(0, recentLimit);
    localStorage.setItem(recentStorageKey, JSON.stringify(this.recent));
    this.closePalette();

    if (entry.name === 'mod.clone') {
      openPrompt({
        title: 'Duplicate mod',
        value: '',
        hint: 'Mod to copy; creates <name>-copy',
        command: { name: 'mod.clone', args: {} },
      });

      return;
    }

    const layoutName = stringOf(shared('layout')) ?? 'main';

    askFirst(entry.name, entry.name === 'layout.clone' ? { name: layoutName } : entry.args);
  }

  private closePalette(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private rows(): Row[] {
    const host = {
      commands,
      layouts,
      platform: currentWindow()?.platform ?? null,
      themes: themeChoices,
    };

    return paletteRows(allEntries(host), this.query, this.recent);
  }

  private onKey(event: KeyEvent, rows: Row[], places: RowPlace[], cx: Context): void {
    const last = rows.length - 1;
    const at = clampIndex(this.at, rows.length);

    if (event.key === 'escape') {
      this.closePalette();

      return;
    }

    if (event.key === 'down') {
      this.at = Math.min(at + 1, last);
    } else if (event.key === 'up') {
      this.at = Math.max(at - 1, 0);
    } else if (event.key === 'pagedown') {
      this.at = Math.min(at + shownRows, last);
    } else if (event.key === 'pageup') {
      this.at = Math.max(at - shownRows, 0);
    } else {
      return;
    }

    this.scroll = scrollToShow(places, this.at, this.scroll, maxScroll(places));
    cx.stop_propagation();
    cx.notify();
  }

  private onWheel(event: ScrollWheelEvent, places: RowPlace[], cx: Context): void {
    const moved = wheelFrom(places, this.at, this.scroll, maxScroll(places), event.delta.y);

    this.scroll = moved.scroll;
    this.at = moved.at;
    cx.notify();
  }

  // In a scrolling list each item is placed at its edges from the model, not stacked: GPUI
  // rounds every height to whole pixels, and a stack of rounded heights drifts away from the
  // model, cutting the selection off. Edges from the model can't add up.
  private placed(
    element: Element,
    start: number,
    end: number,
    scrolls: boolean,
    scroll: number,
  ): Element {
    if (!scrolls) {
      return element;
    }

    return element
      .absolute()
      .left(spacing.none)
      .right(spacing.none)
      .top(start - scroll)
      .bottom(listHeight - (end - scroll));
  }

  private rowElement(row: Row, index: number, at: number): Element {
    const shortcut = entryShortcut(row.entry, shortcutFor);
    const selected = index === at;
    const end: Element[] = [];

    if (this.query !== '') {
      end.push(detailText(row.entry.group));
    }

    if (shortcut !== null) {
      end.push(keyHint(shortcut));
    }

    return listRow({
      size: 'large',
      inset: true,
      state: selected ? 'selected' : 'normal',
      label: highlightedText(row.entry.title, row.positions, selected),
      end,
    })
      .id(`palette-row-${index}`)
      .cursor_pointer()
      .on_click(() => {
        this.go(row.entry);
      });
  }

  private list(
    rows: Row[],
    places: RowPlace[],
    scrolls: boolean,
    at: number,
    scroll: number,
  ): Element {
    const items: Element[] = [];

    for (const [index, row] of rows.entries()) {
      const place = places[index];

      if (place === undefined) {
        continue;
      }

      if (place.head && visible(place.title, place.row, scroll, scrolls)) {
        const head = sectionHeader({ label: row.head, size: 'default' });

        items.push(this.placed(head, place.title, place.row, scrolls, scroll));
      }

      if (visible(place.row, place.row + rowSize, scroll, scrolls)) {
        items.push(
          this.placed(
            this.rowElement(row, index, at),
            place.row,
            place.row + rowSize,
            scrolls,
            scroll,
          ),
        );
      }
    }

    const list = div()
      .id('palette-rows')
      .relative()
      .my(spacing.xsmall)
      .on_scroll_wheel((event, cx) => {
        this.onWheel(event, places, cx);
      });

    return scrolls
      ? list.h(listHeight).overflow_hidden().children(items)
      : list.child(v_flex().children(items));
  }

  private nothingMatches(): Element {
    return emptyState(`Nothing matches "${this.query}". Places are in the picker.`);
  }
}
