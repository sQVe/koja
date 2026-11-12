import { bindingAction } from '../../kit/binding.ts';
import type { CommandTitle } from '../../kit/commandTitles.ts';
import {
  commandIdentity,
  commandTitles,
  focusPaneTitles,
  swapPaneTitles,
} from '../../kit/commandTitles.ts';
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
}

export interface Row {
  entry: Entry;
  head: string;
  positions: number[];
}

export type ShortcutLookup = (...actions: string[]) => string | null;

interface RankedRow extends Row {
  score: number;
}

interface NamedEntry {
  name: string;
  args: Record<string, unknown>;
  group: string;
  title: string;
  words: string;
}

const groups = ['Recent', 'Tab', 'Pane', 'Space', 'Layout', 'Terminal', 'Agent', 'Window', 'App'];

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
): NamedEntry => ({ name: command, args, group, title, words });

const namedEntries: NamedEntry[] = [
  shared(commandTitles.newTab, 'Tab', 'tab agent new task'),
  shared(commandTitles.openPicker, 'Tab', 'switch jump find'),
  shared(commandTitles.renameTab, 'Tab', 'tab'),
  shared(commandTitles.closeTab, 'Tab', 'tab kill'),
  shared(commandTitles.nextTab, 'Tab', 'tab'),
  shared(commandTitles.previousTab, 'Tab', 'tab'),
  shared(commandTitles.splitRight, 'Pane', 'vertical'),
  shared(commandTitles.splitDown, 'Pane', 'horizontal'),
  shared(commandTitles.closePane, 'Pane', 'kill'),
  shared(commandTitles.zoomPane, 'Pane', 'maximize fullscreen'),
  ...focusPaneTitles.map((focus) => shared(focus, 'Pane', 'move go')),
  ...swapPaneTitles.map((swap) => shared(swap, 'Pane', 'move')),
  shared(commandTitles.newSpace, 'Space', 'workspace'),
  shared(commandTitles.renameSpace, 'Space', 'workspace'),
  shared(commandTitles.closeSpace, 'Space', 'workspace kill'),
  shared(commandTitles.nextSpace, 'Space', 'workspace'),
  shared(commandTitles.previousSpace, 'Space', 'workspace'),
  shared(commandTitles.nextLayout, 'Layout', 'look switch'),
  {
    name: 'layout.reset',
    args: {},
    group: 'Layout',
    title: 'Reset layout',
    words: "new version default restore herdr's",
  },
  {
    name: 'layout.clone',
    args: {},
    group: 'Layout',
    title: 'Duplicate layout',
    words: 'clone copy customize',
  },
  {
    name: 'mod.clone',
    args: {},
    group: 'Layout',
    title: 'Duplicate mod',
    words: 'clone copy customize',
  },
  { name: 'terminal.open', args: {}, group: 'Terminal', title: 'New terminal', words: 'shell' },
  { name: 'terminal.copy', args: {}, group: 'Terminal', title: 'Copy', words: 'clipboard' },
  { name: 'terminal.paste', args: {}, group: 'Terminal', title: 'Paste', words: 'clipboard' },
  { name: 'window.minimize', args: {}, group: 'Window', title: 'Minimize window', words: '' },
  {
    name: 'window.maximize',
    args: {},
    group: 'Window',
    title: 'Maximize window',
    words: 'restore',
  },
  { name: 'window.close', args: {}, group: 'Window', title: 'Close window', words: 'quit' },
  {
    name: 'app.settings',
    args: {},
    group: 'App',
    title: 'Settings',
    words: 'preferences options config look font theme sound',
  },
  {
    name: 'app.help',
    args: {},
    group: 'App',
    title: 'Keys',
    words: 'keybindings shortcuts help',
  },
  {
    name: 'app.welcome',
    args: {},
    group: 'App',
    title: 'Welcome',
    words: 'intro start onboarding',
  },
  {
    name: 'app.whats_new',
    args: {},
    group: 'App',
    title: "What's new",
    words: 'release changes news update',
  },
  {
    name: 'app.reset',
    args: {},
    group: 'App',
    title: 'Reset to the default screen',
    words: 'escape hatch broken restore',
  },
  shared(commandTitles.zoomIn, 'App', 'bigger font size'),
  shared(commandTitles.zoomOut, 'App', 'smaller font size'),
  shared(commandTitles.resetZoom, 'App', 'font size'),
  { name: 'app.quit', args: {}, group: 'App', title: 'Quit Herdr', words: 'exit' },
  {
    name: 'mod.open',
    args: { name: 'koja-gallery' },
    group: 'App',
    title: 'Kit gallery',
    words: 'koja ui components design',
  },
];

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
  }));
};

export const allEntries = (host: PaletteHost): Entry[] => {
  const known = new Set(host.commands().map((command) => command.name));
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
    }));

  return [
    ...named,
    ...themeEntries(known, host),
    ...host.layouts().map(layoutEntry),
    ...otherEntries(host),
  ];
};

export const entryShortcut = (entry: Entry, shortcut: ShortcutLookup): string | null =>
  shortcut(bindingAction(entry.name, entry.args));

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
