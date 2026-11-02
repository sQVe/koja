// The command palette: everything you can do, by name, with its key. Places, such as spaces and
// tabs, stay in the picker. Fuzzy: your letters in order, word starts and runs rank higher.
// Empty, it shows recent entries first, then every group. Choices are entries of their own
// ("Layout: Zen"); commands that need a name ask for it. Enter runs, up and down move, Esc
// closes. Herdr's own palette is rewritten on every start and this one is not, so new app
// commands need a name here.

import type {
  AsyncContext,
  Context,
  Element,
  FocusHandle,
  KeyEvent,
  ScrollWheelEvent,
} from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import { closeOverlay, commands, layouts, openOverlay, props, run, shared } from 'herdr';

import {
  colors,
  controlSize,
  currentWindow,
  detailText,
  emptyState,
  highlightedText,
  keyHint,
  listRow,
  overlaySize,
  recordOf,
  rowHeight,
  searchField,
  sectionHeader,
  shortcutFor,
  spacing,
  stringOf,
} from '../../kit/index.ts';
import type { FuzzyMatch } from './fuzzy.ts';
import { fuzzyMatch } from './fuzzy.ts';

interface Entry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  group: string;
  title: string;
  words: string;
}

interface Row {
  entry: Entry;
  head: string;
  positions: number[];
}

interface RankedRow extends Row {
  score: number;
}

// Where a row, and the group title before it, sit in the list's strip, in pixels.
interface RowPlace {
  head: boolean;
  title: number;
  row: number;
}

type NamedEntry = [name: string, args: Record<string, unknown>, group: string, title: string, words: string];

// The list keeps one height while you move: rows and group titles have fixed heights, and the
// list shows as many as fit in this many rows.
const shownRows = 12;

const recentLimit = 20;

const recentShown = 5;

// A title match ranks above one in the group, name, or keywords by this much.
const titleBonus = 4;

// A refocus after the popup has drawn, when the input can take the keyboard.
const refocusMilliseconds = 600;

// A wheel reports lines and a touchpad pixels; deltas under this many are lines.
const wheelLineLimit = 4;

const rankOfUnknown = 99;

const recentStorageKey = 'recent';

const rowSize = rowHeight.large;

const headSize = controlSize.sectionHeader;

const listHeight = shownRows * rowSize;

const groups = ['Recent', 'Tab', 'Pane', 'Space', 'Layout', 'Terminal', 'Agent', 'Window', 'App'];

const directions = ['left', 'right', 'up', 'down'];

const themeNames = ['graphite', 'ink', 'moss', 'atom-one-dark'];

const layoutTitles: Record<string, string> = {
  main: 'Herdr',
  terminals: 'Terminals',
  win98: 'Herdr 98',
};

const namedEntries: NamedEntry[] = [
  ['tab.new', {}, 'Tab', 'New tab', 'tab agent new task'],
  ['mod.open', { name: 'koja-picker' }, 'Tab', 'Go to space or tab…', 'switch jump find'],
  ['tab.rename', {}, 'Tab', 'Rename tab', 'tab'],
  ['tab.close', {}, 'Tab', 'Close tab', 'tab kill'],
  ['tab.next', {}, 'Tab', 'Next tab', 'tab'],
  ['tab.prev', {}, 'Tab', 'Previous tab', 'tab'],
  ['pane.split', { direction: 'right' }, 'Pane', 'Split right', 'vertical'],
  ['pane.split', { direction: 'down' }, 'Pane', 'Split down', 'horizontal'],
  ['pane.close', {}, 'Pane', 'Close pane', 'kill'],
  ['pane.zoom', {}, 'Pane', 'Zoom pane', 'maximize fullscreen'],
  ...directions.map(
    (direction): NamedEntry => ['pane.go', { direction }, 'Pane', `Focus pane ${direction}`, 'move go'],
  ),
  ...directions.map(
    (direction): NamedEntry => ['pane.swap', { direction }, 'Pane', `Swap pane ${direction}`, 'move'],
  ),
  ['space.new', {}, 'Space', 'New space', 'workspace'],
  ['space.rename', {}, 'Space', 'Rename space', 'workspace'],
  ['space.close', {}, 'Space', 'Close space', 'workspace kill'],
  ['space.next', {}, 'Space', 'Next space', 'workspace'],
  ['space.prev', {}, 'Space', 'Previous space', 'workspace'],
  ['layout.switch', {}, 'Layout', 'Next layout', 'look switch'],
  ['layout.reset', {}, 'Layout', 'Reset layout', "new version default restore herdr's"],
  ['layout.clone', {}, 'Layout', 'Duplicate layout', 'clone copy customize'],
  ['mod.clone', {}, 'Layout', 'Duplicate mod', 'clone copy customize'],
  ['terminal.open', {}, 'Terminal', 'New terminal', 'shell'],
  ['terminal.copy', {}, 'Terminal', 'Copy', 'clipboard'],
  ['terminal.paste', {}, 'Terminal', 'Paste', 'clipboard'],
  ['agent.next', {}, 'Agent', 'Next agent', ''],
  ['agent.prev', {}, 'Agent', 'Previous agent', ''],
  ['window.minimize', {}, 'Window', 'Minimize window', ''],
  ['window.maximize', {}, 'Window', 'Maximize window', 'restore'],
  ['window.close', {}, 'Window', 'Close window', 'quit'],
  ['app.settings', {}, 'App', 'Settings', 'preferences options config look font theme sound'],
  ['app.help', {}, 'App', 'Keys', 'keybindings shortcuts help'],
  ['app.welcome', {}, 'App', 'Welcome', 'intro start onboarding'],
  ['app.whats_new', {}, 'App', "What's new", 'release changes news update'],
  ['app.reset', {}, 'App', 'Reset to the default screen', 'escape hatch broken restore'],
  ['app.zoom_in', {}, 'App', 'Zoom in', 'bigger font size'],
  ['app.zoom_out', {}, 'App', 'Zoom out', 'smaller font size'],
  ['app.zoom_reset', {}, 'App', 'Reset zoom', 'font size'],
  ['app.quit', {}, 'App', 'Quit Herdr', 'exit'],
  ['mod.open', { name: 'koja-gallery' }, 'App', 'Kit gallery', 'koja ui components design'],
  ...themeNames.map(
    (name): NamedEntry => [
      'app.theme',
      { name },
      'App',
      `Theme: ${name.replaceAll('-', ' ')}`,
      'colors look',
    ],
  ),
];

// Commands that act on something you point at, such as ids and terminals: not for a list.
const hiddenCommands = new Set([
  'space.move',
  'tab.move',
  'space.select',
  'tab.select',
  'pane.focus',
  'terminal.keep',
  'terminal.park',
  'terminal.kill',
  'terminal.show',
  'agent.focus',
  'layout.set',
  'layout.toggle',
  'layout.show',
  'layout.hide',
  'layout.resize',
  'layout.select',
  'mod.open',
  'overlay.close',
  'tab.settle',
  'tab.unsettle',
  'app.palette',
  'app.hide',
  'app.hide_others',
  'app.show_all',
  'app.theme',
  'app.settings',
]);

const namedCommands = new Set(namedEntries.map(([name]) => name));

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const titleOf = (name: string): { group: string; title: string } => {
  const [noun = '', verb = ''] = name.split('.');

  return { group: capitalize(noun), title: capitalize(`${verb.replaceAll('_', ' ')} ${noun}`) };
};

const entryId = (name: string, args: Record<string, unknown>): string =>
  `${name}:${JSON.stringify(args)}`;

const layoutEntry = (name: string): Entry => {
  const title = layoutTitles[name] ?? capitalize(name);
  const args = { name };

  return {
    id: entryId('layout.switch', args),
    name: 'layout.switch',
    args,
    group: 'Layout',
    title: `Layout: ${title}`,
    words: `look ${name}`,
  };
};

// Anything new in the app shows up too, until it gets a better name here.
const otherEntries = (): Entry[] =>
  commands()
    .filter((command) => !namedCommands.has(command.name) && !hiddenCommands.has(command.name))
    .filter((command) => !command.args.some((arg) => arg.required && arg.name !== 'name'))
    .map((command) => {
      const { group, title } = titleOf(command.name);

      return { id: entryId(command.name, {}), name: command.name, args: {}, group, title, words: command.about };
    });

// Every entry for the state the app is in now.
const allEntries = (): Entry[] => {
  const known = new Set(commands().map((command) => command.name));
  const onMacos = currentWindow()?.platform === 'macos';

  const named = namedEntries
    .filter(([name]) => known.has(name))
    .filter(([name]) => !(onMacos && name.startsWith('window.')))
    .map(([name, args, group, title, words]) => ({
      id: entryId(name, args),
      name,
      args,
      group,
      title,
      words,
    }));

  return [...named, ...layouts().map(layoutEntry), ...otherEntries()];
};

// The key bound to an entry: `name`, or `name:value` with its first argument.
const entryShortcut = (entry: Entry): string | null => {
  const value = Object.values(entry.args)[0];

  return shortcutFor(typeof value === 'string' ? `${entry.name}:${value}` : entry.name);
};

const readRecent = (): string[] => {
  const stored: unknown = JSON.parse(localStorage.getItem(recentStorageKey) ?? '[]');

  return Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === 'string')
    : [];
};

const matchEntry = (query: string, entry: Entry): FuzzyMatch | null => {
  const title = fuzzyMatch(query, entry.title);

  if (title !== null) {
    return title;
  }

  const more = fuzzyMatch(query, `${entry.group} ${entry.title} ${entry.name} ${entry.words}`);

  return more === null ? null : { score: more.score - titleBonus, positions: [] };
};

const placesOf = (rows: Row[], grouped: boolean): RowPlace[] => {
  const places: RowPlace[] = [];
  let top = 0;

  for (const [index, row] of rows.entries()) {
    const opensGroup = index === 0 || row.head !== rows[index - 1]?.head;
    const head = grouped && opensGroup;
    const headHeight = head ? headSize : 0;

    places.push({ head, title: top, row: top + headHeight });
    top += headHeight + rowSize;
  }

  return places;
};

const closePalette = (): void => {
  const overlay = stringOf(recordOf(props())['overlay']);

  if (overlay !== null) {
    closeOverlay(overlay);
  }
};

export default class Palette extends View {
  private query = '';

  private at = 0;

  // How far the list is scrolled, in pixels.
  private scroll = 0;

  private maxScroll = 0;

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
      this.go(this.rows()[this.at]?.entry);
    });

    this.input.focus();

    cx.timer.after(refocusMilliseconds, () => {
      this.input.focus();
    });
  }

  override render(): Element {
    const rows = this.rows();
    const grouped = this.query === '';
    const places = placesOf(rows, grouped);
    const total = places.length === 0 ? 0 : rowSize + (places.at(-1)?.row ?? 0);
    const scrolls = total > listHeight;

    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    this.maxScroll = Math.max(0, total - listHeight);
    this.keepSelectionInView(places);

    const palette = v_flex()
      .id('palette')
      .w_full()
      .min_h(0)
      .bg(colors().popover)
      .on_key_down((event, cx) => {
        this.onKey(event, rows.length, cx);
      })
      .child(searchField(this.input, 'command'))
      .child(rows.length > 0 ? this.list(rows, places, scrolls) : this.nothingMatches());

    return this.handle === null ? palette : palette.track_focus(this.handle);
  }

  private go(entry: Entry | undefined): void {
    if (entry === undefined) {
      return;
    }

    this.recent = [entry.id, ...this.recent.filter((id) => id !== entry.id)].slice(0, recentLimit);
    localStorage.setItem(recentStorageKey, JSON.stringify(this.recent));
    closePalette();

    if (entry.name === 'mod.clone') {
      openOverlay({
        mod: 'prompt',
        kind: 'dialog',
        width: overlaySize.promptWidth,
        props: {
          title: 'Duplicate mod',
          hint: 'Mod to copy; creates <name>-copy',
          command: { name: 'mod.clone', args: {} },
        },
      });

      return;
    }

    const layoutName = stringOf(shared('layout')) ?? 'main';

    run(entry.name, entry.name === 'layout.clone' ? { name: layoutName } : entry.args);
  }

  // The rows to show: grouped when the query is empty, ranked while typing.
  private rows(): Row[] {
    const all = allEntries();
    const query = this.query.trim().toLowerCase().replaceAll(/\s+/g, '');

    if (query === '') {
      return this.groupedRows(all);
    }

    const rank = (entry: Entry): number => {
      const index = this.recent.indexOf(entry.id);

      return index === -1 ? rankOfUnknown : index;
    };

    return all
      .map((entry): RankedRow | null => {
        const match = matchEntry(query, entry);

        return match === null
          ? null
          : { entry, head: entry.group, positions: match.positions, score: match.score };
      })
      .filter((row): row is RankedRow => row !== null)
      .toSorted((first, second) => second.score - first.score || rank(first.entry) - rank(second.entry));
  }

  private groupedRows(all: Entry[]): Row[] {
    const recent = this.recent
      .map((id) => all.find((entry) => entry.id === id))
      .filter((entry): entry is Entry => entry !== undefined)
      .slice(0, recentShown);

    const rest = all.filter((entry) => !recent.includes(entry));
    const ordered = groups.slice(1).flatMap((group) => rest.filter((entry) => entry.group === group));
    const others = rest.filter((entry) => !groups.includes(entry.group));

    return [
      ...recent.map((entry) => ({ entry, head: 'Recent', positions: [] })),
      ...[...ordered, ...others].map((entry) => ({ entry, head: entry.group, positions: [] })),
    ];
  }

  // Scrolls only as far as it takes to keep the selected row, and the group title it opens,
  // in view.
  private keepSelectionInView(places: RowPlace[]): void {
    const selected = places[this.at];

    if (selected !== undefined) {
      const from = selected.head ? selected.title : selected.row;

      if (from < this.scroll) {
        this.scroll = from;
      }

      if (selected.row + rowSize > this.scroll + listHeight) {
        this.scroll = selected.row + rowSize - listHeight;
      }
    }

    this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll));
  }

  private onKey(event: KeyEvent, count: number, cx: Context): void {
    const last = count - 1;

    if (event.key === 'escape') {
      closePalette();

      return;
    }

    // Stops at the ends: wrapping would jump out of sight.
    if (event.key === 'down') {
      this.at = Math.min(this.at + 1, last);
    } else if (event.key === 'up') {
      this.at = Math.max(this.at - 1, 0);
    } else if (event.key === 'pagedown') {
      this.at = Math.min(this.at + shownRows, last);
    } else if (event.key === 'pageup') {
      this.at = Math.max(this.at - shownRows, 0);
    } else {
      return;
    }

    cx.stop_propagation();
    cx.notify();
  }

  private onWheel(event: ScrollWheelEvent, places: RowPlace[], cx: Context): void {
    const lines = Math.abs(event.delta.y) < wheelLineLimit;
    const delta = lines ? event.delta.y * rowSize : event.delta.y;

    this.scroll = Math.max(0, Math.min(this.scroll - delta, this.maxScroll));

    // The selection stays on screen, so the next frame doesn't scroll back to it.
    while (this.at < places.length - 1 && (places[this.at]?.row ?? 0) < this.scroll) {
      this.at += 1;
    }

    while (this.at > 0 && (places[this.at]?.row ?? 0) + rowSize > this.scroll + listHeight) {
      this.at -= 1;
    }

    cx.notify();
  }

  // In a scrolling list each item is placed at its edges from the model, not stacked: GPUI
  // rounds every height to whole pixels, and a stack of rounded heights drifts away from the
  // model, cutting the selection off. Edges from the model can't add up.
  private placed(element: Element, start: number, end: number, scrolls: boolean): Element {
    if (!scrolls) {
      return element;
    }

    return element
      .absolute()
      .left(spacing.none)
      .right(spacing.none)
      .top(start - this.scroll)
      .bottom(listHeight - (end - this.scroll));
  }

  private visible(start: number, end: number, scrolls: boolean): boolean {
    const inView = end > this.scroll && start < this.scroll + listHeight;

    return !scrolls || inView;
  }

  private rowElement(row: Row, index: number): Element {
    const shortcut = entryShortcut(row.entry);
    const selected = index === this.at;
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

  private list(rows: Row[], places: RowPlace[], scrolls: boolean): Element {
    const items: Element[] = [];

    for (const [index, row] of rows.entries()) {
      const place = places[index];

      if (place === undefined) {
        continue;
      }

      if (place.head && this.visible(place.title, place.row, scrolls)) {
        const head = sectionHeader({ label: row.head, size: 'default' });

        items.push(this.placed(head, place.title, place.row, scrolls));
      }

      if (this.visible(place.row, place.row + rowSize, scrolls)) {
        items.push(this.placed(this.rowElement(row, index), place.row, place.row + rowSize, scrolls));
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
