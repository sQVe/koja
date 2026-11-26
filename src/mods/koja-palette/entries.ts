import { bindingAction } from '../../kit/binding.ts';
import type { CommandTitle } from '../../kit/commandTitles.ts';
import {
  commandIdentity,
  commandTitles,
  focusPaneTitles,
  swapPaneTitles,
} from '../../kit/commandTitles.ts';
import type { IconName } from '../../kit/iconNames.ts';
import type { ModeHint } from '../../kit/shortcutBinding.ts';
import type { ThemeChoice } from '../../kit/themes.ts';
import type { FuzzyMatch } from './fuzzy.ts';
import { fuzzyMatch } from './fuzzy.ts';

interface Command {
  name: string;
  args: { name: string; required: boolean }[];
  about: string;
}

export interface PaletteHost {
  commands: () => Command[];
  layouts: () => string[];
  platform: string | null;
  themes: () => ThemeChoice[];
}

export interface Entry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  group: string;
  title: string;
  words: string;
  icon: IconName;
}

export interface Row {
  entry: Entry;
  head: string;
  positions: number[];
}

export type HintLookup = (...actions: string[]) => ModeHint;

export interface GroupHeading {
  label: string;
  letter: string | null;
}

export interface PaletteCount {
  filtered: boolean;
  count: number;
}

interface RankedRow extends Row {
  score: number;
}

interface NamedEntry {
  name: string;
  args: Record<string, unknown>;
  group: string;
  title: string;
  words: string;
  icon: IconName;
}

const groups = ['Recent', 'Tab', 'Pane', 'Space', 'Layout', 'Terminal', 'Agent', 'Window', 'App'];

// The part letters are fixed, so they are listed here rather than read from the key table, whose
// shortest form for a pane is `h`.
const headings: Record<string, GroupHeading> = {
  Recent: { label: 'Recent', letter: null },
  Tab: { label: 'Tabs', letter: 't' },
  Pane: { label: 'Panes', letter: 'w' },
  Space: { label: 'Spaces', letter: 's' },
  Layout: { label: 'Layouts', letter: 'z' },
  Terminal: { label: 'Terminals', letter: null },
  Agent: { label: 'Agents', letter: null },
  Window: { label: 'Window', letter: null },
  App: { label: 'App', letter: null },
};

const recentShown = 5;

const titleBonus = 4;

const rankOfUnknown = 99;

const layoutTitles: Record<string, string> = {
  main: 'Herdr',
  terminals: 'Terminals',
  win98: 'Herdr 98',
};

const shared = (
  { command, args, title }: CommandTitle,
  group: string,
  words: string,
  icon: IconName,
): NamedEntry => ({ name: command, args, group, title, words, icon });

const directionIcon = (direction: unknown): IconName =>
  direction === 'left' || direction === 'right' ? 'columns-2' : 'rows-2';

const namedEntries: NamedEntry[] = [
  shared(commandTitles.newTab, 'Tab', 'tab agent new task', 'plus'),
  shared(commandTitles.openPicker, 'Tab', 'switch jump find', 'search'),
  shared(commandTitles.renameTab, 'Tab', 'tab', 'square-pen'),
  shared(commandTitles.closeTab, 'Tab', 'tab kill', 'x'),
  shared(commandTitles.nextTab, 'Tab', 'tab', 'chevron-right'),
  shared(commandTitles.previousTab, 'Tab', 'tab', 'chevron-left'),
  shared(commandTitles.moveTabLeft, 'Tab', 'tab reorder', 'chevron-left'),
  shared(commandTitles.moveTabRight, 'Tab', 'tab reorder', 'chevron-right'),
  shared(commandTitles.splitRight, 'Pane', 'vertical', 'panel-right'),
  shared(commandTitles.splitDown, 'Pane', 'horizontal', 'panel-bottom'),
  shared(commandTitles.closePane, 'Pane', 'kill', 'x'),
  shared(commandTitles.zoomPane, 'Pane', 'maximize fullscreen', 'maximize-2'),
  ...focusPaneTitles.map((focus) =>
    shared(focus, 'Pane', 'move go', directionIcon(focus.args['direction'])),
  ),
  ...swapPaneTitles.map((swap) =>
    shared(swap, 'Pane', 'move', directionIcon(swap.args['direction'])),
  ),
  shared(commandTitles.newSpace, 'Space', 'workspace', 'plus'),
  shared(commandTitles.renameSpace, 'Space', 'workspace', 'square-pen'),
  shared(commandTitles.closeSpace, 'Space', 'workspace kill', 'x'),
  shared(commandTitles.nextSpace, 'Space', 'workspace', 'chevron-right'),
  shared(commandTitles.previousSpace, 'Space', 'workspace', 'chevron-left'),
  shared(commandTitles.nextLayout, 'Layout', 'look switch', 'layers'),
  {
    name: 'layout.reset',
    args: {},
    group: 'Layout',
    title: 'Reset layout',
    words: "new version default restore herdr's",
    icon: 'layers',
  },
  {
    name: 'layout.clone',
    args: {},
    group: 'Layout',
    title: 'Duplicate layout',
    words: 'clone copy customize',
    icon: 'layers',
  },
  {
    name: 'mod.clone',
    args: {},
    group: 'Layout',
    title: 'Duplicate mod',
    words: 'clone copy customize',
    icon: 'layers',
  },
  {
    name: 'terminal.open',
    args: {},
    group: 'Terminal',
    title: 'New terminal',
    words: 'shell',
    icon: 'plus',
  },
  {
    name: 'terminal.copy',
    args: {},
    group: 'Terminal',
    title: 'Copy',
    words: 'clipboard',
    icon: 'terminal',
  },
  {
    name: 'terminal.paste',
    args: {},
    group: 'Terminal',
    title: 'Paste',
    words: 'clipboard',
    icon: 'terminal',
  },
  {
    name: 'window.minimize',
    args: {},
    group: 'Window',
    title: 'Minimize window',
    words: '',
    icon: 'minimize-2',
  },
  {
    name: 'window.maximize',
    args: {},
    group: 'Window',
    title: 'Maximize window',
    words: 'restore',
    icon: 'maximize-2',
  },
  {
    name: 'window.close',
    args: {},
    group: 'Window',
    title: 'Close window',
    words: 'quit',
    icon: 'x',
  },
  {
    name: 'app.settings',
    args: {},
    group: 'App',
    title: 'Settings',
    words: 'preferences options config look font theme sound',
    icon: 'command',
  },
  {
    name: 'app.help',
    args: {},
    group: 'App',
    title: 'Keys',
    words: 'keybindings shortcuts help',
    icon: 'keyboard',
  },
  {
    name: 'app.welcome',
    args: {},
    group: 'App',
    title: 'Welcome',
    words: 'intro start onboarding',
    icon: 'message-square',
  },
  {
    name: 'app.whats_new',
    args: {},
    group: 'App',
    title: "What's new",
    words: 'release changes news update',
    icon: 'message-square',
  },
  {
    name: 'app.reset',
    args: {},
    group: 'App',
    title: 'Reset to the default screen',
    words: 'escape hatch broken restore',
    icon: 'monitor',
  },
  shared(commandTitles.zoomIn, 'App', 'bigger font size', 'monitor'),
  shared(commandTitles.zoomOut, 'App', 'smaller font size', 'monitor'),
  shared(commandTitles.resetZoom, 'App', 'font size', 'monitor'),
  {
    name: 'app.quit',
    args: {},
    group: 'App',
    title: 'Quit Herdr',
    words: 'exit',
    icon: 'x',
  },
  {
    name: 'mod.open',
    args: { name: 'koja-gallery' },
    group: 'App',
    title: 'Kit gallery',
    words: 'koja ui components design',
    icon: 'palette',
  },
];

const hiddenCommands = new Set([
  'space.move',
  'space.select',
  'tab.select',
  'pane.focus',
  'terminal.keep',
  'terminal.park',
  'terminal.kill',
  'terminal.show',
  'agent.focus',
  'agent.next',
  'agent.prev',
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

const namedCommands = new Set(namedEntries.map((entry) => entry.name));

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const titleOf = (name: string): { group: string; title: string } => {
  const [noun = '', verb = ''] = name.split('.');

  return { group: capitalize(noun), title: capitalize(`${verb.replaceAll('_', ' ')} ${noun}`) };
};

const layoutEntry = (name: string): Entry => {
  const title = layoutTitles[name] ?? capitalize(name);
  const args = { name };

  return {
    id: commandIdentity('layout.switch', args),
    name: 'layout.switch',
    args,
    group: 'Layout',
    title: `Layout: ${title}`,
    words: `look ${name}`,
    icon: 'layers',
  };
};

const otherEntries = (host: PaletteHost): Entry[] =>
  host
    .commands()
    .filter((command) => !namedCommands.has(command.name) && !hiddenCommands.has(command.name))
    .filter((command) => !command.args.some((arg) => arg.required && arg.name !== 'name'))
    .map((command) => {
      const { group, title } = titleOf(command.name);

      return {
        id: commandIdentity(command.name, {}),
        name: command.name,
        args: {},
        group,
        title,
        words: command.about,
        icon: 'command',
      };
    });

const themeEntries = (known: ReadonlySet<string>, host: PaletteHost): Entry[] => {
  if (!known.has('app.theme')) {
    return [];
  }

  return host.themes().map((theme) => ({
    id: commandIdentity('app.theme', { name: theme.name }),
    name: 'app.theme',
    args: { name: theme.name },
    group: 'App',
    title: theme.label,
    words: 'colors look',
    icon: 'palette',
  }));
};

export const allEntries = (host: PaletteHost): Entry[] => {
  const commandNames = host.commands().map((command) => command.name);
  const known = new Set(commandNames);
  const onMacos = host.platform === 'macos';

  const named = namedEntries
    .filter((entry) => known.has(entry.name))
    .filter((entry) => !(onMacos && entry.name.startsWith('window.')))
    .map((entry): Entry => ({
      id: commandIdentity(entry.name, entry.args),
      name: entry.name,
      args: entry.args,
      group: entry.group,
      title: entry.title,
      words: entry.words,
      icon: entry.icon,
    }));

  return [
    ...named,
    ...themeEntries(known, host),
    ...host.layouts().map(layoutEntry),
    ...otherEntries(host),
  ];
};

export const entryHint = (entry: Entry, hint: HintLookup): ModeHint =>
  hint(bindingAction(entry.name, entry.args));

export const headingOf = (group: string): GroupHeading =>
  headings[group] ?? { label: group, letter: null };

export const paletteCount = (
  all: readonly Entry[],
  rows: readonly Row[],
  query: string,
): PaletteCount =>
  query.trim() === ''
    ? { filtered: false, count: all.length }
    : { filtered: true, count: rows.length };

const matchEntry = (query: string, entry: Entry): FuzzyMatch | null => {
  const title = fuzzyMatch(query, entry.title);

  if (title !== null) {
    return title;
  }

  const more = fuzzyMatch(query, `${entry.group} ${entry.title} ${entry.name} ${entry.words}`);

  return more === null ? null : { score: more.score - titleBonus, positions: [] };
};

const groupedRows = (all: Entry[], recentIds: readonly string[]): Row[] => {
  const recent = recentIds
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
};

export const paletteRows = (all: Entry[], query: string, recentIds: readonly string[]): Row[] => {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, '');

  if (normalized === '') {
    return groupedRows(all, recentIds);
  }

  const rank = (entry: Entry): number => {
    const index = recentIds.indexOf(entry.id);

    return index === -1 ? rankOfUnknown : index;
  };

  return all
    .map((entry): RankedRow | null => {
      const match = matchEntry(normalized, entry);

      return match === null
        ? null
        : { entry, head: entry.group, positions: match.positions, score: match.score };
    })
    .filter((row): row is RankedRow => row !== null)
    .toSorted(
      (first, second) => second.score - first.score || rank(first.entry) - rank(second.entry),
    );
};
