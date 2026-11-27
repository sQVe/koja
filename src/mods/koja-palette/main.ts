import type { InputState } from 'gpui-base';
import { InputState as InputStates, h_flex } from 'gpui-base';
import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ScrollWheelEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { appHome, commands, layouts, settings, shared } from 'herdr';

import type { MainColumnInsets } from '../../kit/index.ts';
import {
  askFirst,
  closeOverlay,
  colors,
  currentWindow,
  footerLine,
  highlightedText,
  hintFor,
  icon,
  mainColumnInsets,
  mainColumnPlacement,
  openPrompt,
  overlayCard,
  overlayHeading,
  overlayHints,
  overlayRow,
  overlaySize,
  recordOverlayClose,
  scrollThumb,
  searchInputLine,
  spacing,
  stateLine,
  stringOf,
  themeChoices,
  thumbPlace,
} from '../../kit/index.ts';
import { parsedJson } from '../../kit/parsedJson.ts';
import type { Entry, PaletteCount, Row } from './entries.ts';
import {
  allEntries,
  entryHint,
  headingOf,
  isEmptyQuery,
  paletteCount,
  paletteRows,
} from './entries.ts';
import type { ModPalette } from './modPalette.ts';
import { readModPalettes } from './modPalette.ts';
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

const emptyArgsSuffix = /:{}$/;

const readRecent = (): string[] => {
  const stored: unknown = parsedJson(localStorage.getItem(recentStorageKey));

  if (!Array.isArray(stored)) {
    return [];
  }

  return stored
    .filter((item): item is string => typeof item === 'string')
    .map((id) => id.replace(emptyArgsSuffix, ''));
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const hasName = (entry: Entry): boolean => {
  const name = entry.args['name'];

  return typeof name === 'string' && name.trim() !== '';
};

const shownLayout = (): string => stringOf(shared('layout')) ?? 'main';

export default class Palette extends View {
  private query = '';

  private at = 0;

  private scroll = 0;

  private recent = readRecent();

  private normalMode = false;

  private insets: MainColumnInsets = { left: 0, top: 0 };

  private readonly input: InputState = InputStates.new({ placeholder: 'Type a command' });

  private mods: ModPalette[] = [];

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.normalMode = Boolean(shared('koja-modal'));
    this.insets = mainColumnInsets();
    this.handle = cx.focus_handle();

    this.input.on('change', (_event, changeCx) => {
      this.query = this.input.value();
      this.at = 0;
      changeCx.notify();
    });

    this.input.on('submit', () => {
      this.go(rowAt(this.rows(this.entries()), this.at)?.entry);
    });

    this.input.focus();

    cx.spawn(async (taskCx) => {
      try {
        const mods = await readModPalettes(appHome());

        if (mods.length === 0) {
          return;
        }

        this.mods = mods;
      } catch {
        // An unreadable mod palette must not hide the built-in commands.
      }

      taskCx.notify();
    });

    cx.timer.after(refocusMilliseconds, () => {
      this.input.focus();
    });
  }

  override close(): void {
    recordOverlayClose();
  }

  override render(): Element {
    const all = this.entries();
    const rows = this.rows(all);
    const grouped = isEmptyQuery(this.query);

    const places = placesOf(
      rows.map((row) => row.head),
      grouped,
    );

    const max = maxScroll(places);
    const at = clampIndex(this.at, rows.length);
    const scroll = scrollToShow(places, at, this.scroll, max);

    const body = rows.length > 0 ? this.list(rows, places, at, scroll) : this.nothingMatches();

    const count = paletteCount(all, rows, this.query);

    const card = overlayCard('palette')
      .w(overlaySize.paletteWidth)
      .flex_none()
      .on_mouse_down('left', (_event, cx) => {
        cx.stop_propagation();
      })
      .on_key_down((event, cx) => {
        this.onKey(event, rows, places, cx);
      })
      .child(this.searchRow())
      .child(body)
      .child(footerLine([this.countText(count)]));

    const focused = this.handle === null ? card : card.track_focus(this.handle);

    const backdrop = div()
      .id('palette-backdrop')
      .size_full()
      .on_mouse_down('left', () => {
        this.closePalette();
      })
      .child(this.mainRow(focused));

    return backdrop;
  }

  private mainRow(card: Element): Element {
    const place = mainColumnPlacement(this.insets, overlaySize.topOffset);
    const spacer = div().w(place.left).flex_none();
    const trailing = div().w(place.right).flex_none();

    const centered = h_flex()
      .flex_1()
      .min_w(0)
      .pt(place.top)
      .justify_center()
      .items_start()
      .child(card);

    return h_flex().size_full().child(spacer).child(centered).child(trailing);
  }

  private go(entry: Entry | undefined): void {
    if (entry === undefined) {
      return;
    }

    this.recent = [entry.id, ...this.recent.filter((id) => id !== entry.id)].slice(0, recentLimit);
    localStorage.setItem(recentStorageKey, JSON.stringify(this.recent));
    this.closePalette();

    if (entry.name === 'mod.clone' && !hasName(entry)) {
      openPrompt({
        title: 'Duplicate mod',
        value: '',
        hint: 'Mod to copy; creates <name>-copy',
        command: { name: 'mod.clone', args: entry.args },
      });

      return;
    }

    const layoutName = shownLayout();
    const clone = entry.name === 'layout.clone' && !hasName(entry);
    const args = clone ? { ...entry.args, name: layoutName } : entry.args;

    askFirst(entry.name, args);
  }

  private closePalette(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private entries(): Entry[] {
    const host = {
      commands,
      layouts,
      platform: currentWindow()?.platform ?? null,
      themes: themeChoices,
      dark: settings()['appearance'] === 'dark',
      layout: shownLayout(),
    };

    return allEntries(host, this.mods);
  }

  private rows(all: Entry[]): Row[] {
    return paletteRows(all, this.query, this.recent);
  }

  private countText(count: PaletteCount): string {
    return count.filtered
      ? plural(count.count, 'match', 'matches')
      : plural(count.count, 'command', 'commands');
  }

  private searchRow(): Element {
    return div()
      .flex_none()
      .border_b(spacing.hairline)
      .border_color(colors().border)
      .child(searchInputLine(this.input));
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

  // Each item is placed at its edges from the model, not stacked: GPUI rounds every height to
  // whole pixels, and a stack of rounded heights drifts away from the model, cutting the
  // selection off. Edges from the model can't add up.
  private placed(
    element: Element,
    start: number,
    end: number,
    height: number,
    scroll: number,
  ): Element {
    return element
      .absolute()
      .left(spacing.none)
      .right(spacing.none)
      .top(start - scroll)
      .bottom(height - (end - scroll));
  }

  private rowElement(row: Row, index: number, at: number): Element {
    const selected = index === at;
    const state = selected ? 'selected' : 'normal';
    const start = icon(row.entry.icon, 'small').text_color(colors().muted);

    return overlayRow({
      size: 'medium',
      state,
      start,
      label: highlightedText(row.entry.title, row.positions, selected),
      end: overlayHints(entryHint(row.entry, hintFor), this.normalMode),
    })
      .id(`palette-row-${index}`)
      .cursor_pointer()
      .on_click(() => {
        this.go(row.entry);
      });
  }

  private list(rows: Row[], places: RowPlace[], at: number, scroll: number): Element {
    const items: Element[] = [];
    const height = Math.min(totalHeight(places), listHeight);

    for (const [index, row] of rows.entries()) {
      const place = places[index];

      if (place === undefined) {
        continue;
      }

      if (place.head && visible(place.title, place.row, scroll)) {
        const heading = headingOf(row.head);
        const head = overlayHeading(heading.label, heading.letter);

        items.push(this.placed(head, place.title, place.row, height, scroll));
      }

      if (visible(place.row, place.row + rowSize, scroll)) {
        items.push(
          this.placed(
            this.rowElement(row, index, at),
            place.row,
            place.row + rowSize,
            height,
            scroll,
          ),
        );
      }
    }

    const list = div()
      .id('palette-rows')
      .relative()
      .h(height)
      .overflow_hidden()
      .on_scroll_wheel((event, cx) => {
        this.onWheel(event, places, cx);
      })
      .children(items);

    const thumb = thumbPlace({ scroll, total: totalHeight(places), view: height });
    const box = div().relative().flex_none().child(list);

    return thumb === null ? box : box.child(scrollThumb(thumb));
  }

  private nothingMatches(): Element {
    return stateLine({
      kind: 'empty',
      text: `Nothing matches "${this.query}". Places are in the picker.`,
    });
  }
}
