import { actionName } from './keyNames.ts';
import type { NormalAction, NormalIntent, NormalKey } from './normalKeys.ts';
import { normalKeys } from './normalKeys.ts';

export type PartLetter = 'w' | 't' | 's' | 'g' | 'z';

export interface KeyHintRow {
  keys: string[];
  label: string;
}

export interface KeyHintGroup {
  title: string;
  rows: KeyHintRow[];
}

export interface PartKeyHints {
  letter: PartLetter;
  title: string;
  groups: KeyHintGroup[];
}

interface GroupSpec {
  title: string;
  holds: (action: NormalAction) => boolean;
  label: (name: string) => string;
  order?: string[];
}

export const partLetters: PartLetter[] = ['w', 't', 's', 'g', 'z'];

export const partTitles: Record<PartLetter, string> = {
  w: 'Panes',
  t: 'Tabs',
  s: 'Spaces',
  g: 'Go to',
  z: 'View',
};

export const isPartLetter = (key: string): key is PartLetter =>
  partLetters.some((part) => part === key);

const isCommand = (action: NormalAction, ...commands: string[]): boolean =>
  action.kind === 'command' && commands.includes(action.command);

const isIntent = (action: NormalAction, ...intents: NormalIntent[]): boolean =>
  action.kind === 'intent' && intents.includes(action.intent);

const capitalized = (text: string): string => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

const lastWord = (name: string): string => capitalized(name.slice(name.lastIndexOf(' ') + 1));

const partNoun = / (pane|panes|tab|tabs|space|spaces)$/u;

// A row's label names the action without the part it already sits under: "Zoom pane" under Panes
// reads "Zoom".
const withoutPartNoun = (name: string): string =>
  name.replace(' other ', ' others ').replace(partNoun, '');

const withoutVerb =
  (verb: string) =>
  (name: string): string =>
    name.startsWith(`${verb} `) ? capitalized(name.slice(verb.length + 1)) : name;

const paneGroupSpecs: GroupSpec[] = [
  {
    title: 'Focus',
    holds: (action) =>
      isCommand(action, 'pane.go') || isIntent(action, 'nextPane', 'previousPane', 'lastPane'),
    label: withoutVerb('Focus pane'),
  },
  {
    title: 'Move',
    holds: (action) => isCommand(action, 'pane.swap'),
    label: withoutVerb('Swap pane'),
  },
  {
    title: 'Split',
    holds: (action) => isCommand(action, 'pane.split'),
    label: withoutVerb('Split'),
    // Split right comes first, as it does in the pane header.
    order: ['Split right', 'Split down'],
  },
  {
    title: 'Zoom and close',
    holds: (action) =>
      isCommand(action, 'pane.zoom', 'pane.close') || isIntent(action, 'closeOtherPanes'),
    label: withoutPartNoun,
    order: ['Zoom pane', 'Close pane', 'Close other panes'],
  },
];

const tabGroupSpecs: GroupSpec[] = [
  {
    title: 'New and close',
    holds: (action) => isCommand(action, 'tab.new', 'tab.close'),
    label: withoutPartNoun,
  },
  {
    title: 'Rename',
    holds: (action) => isCommand(action, 'tab.rename'),
    label: withoutPartNoun,
  },
  {
    title: 'Step',
    holds: (action) => isCommand(action, 'tab.prev', 'tab.next'),
    label: withoutPartNoun,
  },
  {
    title: 'Move',
    holds: (action) => isCommand(action, 'tab.move'),
    label: lastWord,
  },
  {
    title: 'Select',
    holds: (action) => isCommand(action, 'tab.select'),
    label: (name) => name,
  },
];

const spaceGroupSpecs: GroupSpec[] = [
  {
    title: 'New and close',
    holds: (action) => isCommand(action, 'space.new', 'space.close'),
    label: withoutPartNoun,
  },
  {
    title: 'Rename',
    holds: (action) => isCommand(action, 'space.rename'),
    label: withoutPartNoun,
  },
  {
    title: 'Step',
    holds: (action) => isCommand(action, 'space.next', 'space.prev'),
    label: withoutPartNoun,
  },
  {
    title: 'Find',
    holds: (action) => isCommand(action, 'mod.open'),
    label: (name) => name,
  },
];

const goGroupSpecs: GroupSpec[] = [
  {
    title: 'Tabs',
    holds: (action) => isCommand(action, 'tab.next', 'tab.prev') || isIntent(action, 'lastTab'),
    label: (name) => name,
  },
  {
    title: 'Terminal',
    holds: (action) => isCommand(action, 'terminal.scroll'),
    label: (name) => name,
  },
];

const viewGroupSpecs: GroupSpec[] = [
  {
    title: 'Layout',
    holds: (action) => isCommand(action, 'layout.toggle', 'layout.switch'),
    label: (name) => name,
  },
  {
    title: 'Zoom',
    holds: (action) => isCommand(action, 'app.zoom_in', 'app.zoom_out', 'app.zoom_reset'),
    label: (name) => name,
  },
];

const groupSpecs: Record<PartLetter, GroupSpec[]> = {
  w: paneGroupSpecs,
  t: tabGroupSpecs,
  s: spaceGroupSpecs,
  g: goGroupSpecs,
  z: viewGroupSpecs,
};

const partEntries = (part: PartLetter): NormalKey[] =>
  normalKeys.filter((entry) => entry.keys.length === 2 && entry.keys[0] === part);

// The table repeats an action once per alias. The card shows one row per action, with the shortest
// sequence the table gives it, so a row never lists an alias beside the key it stands for.
const shownEntries = (entries: NormalKey[]): NormalKey[] => {
  const shown = new Map<string, NormalKey>();

  for (const entry of entries) {
    const name = actionName(entry.action);

    if (name === undefined) {
      continue;
    }

    const kept = shown.get(name);

    if (kept === undefined || entry.keys.length < kept.keys.length) {
      shown.set(name, entry);
    }
  }

  return [...shown.values()];
};

const orderIndex = (order: readonly string[], name: string): number => {
  const index = order.indexOf(name);

  return index === -1 ? order.length : index;
};

const orderedRows = (spec: GroupSpec, entries: NormalKey[]): KeyHintRow[] => {
  const rows = entries.flatMap((entry) => {
    if (!spec.holds(entry.action)) {
      return [];
    }

    const name = actionName(entry.action) ?? '';

    return [{ keys: entry.keys.slice(1), label: spec.label(name), name }];
  });

  const order = spec.order;

  if (order === undefined) {
    return rows;
  }

  return rows.toSorted(
    (first, second) => orderIndex(order, first.name) - orderIndex(order, second.name),
  );
};

export const partKeyHints = (part: PartLetter): PartKeyHints => {
  const entries = shownEntries(partEntries(part));

  const groups = groupSpecs[part].flatMap((spec) => {
    const rows = orderedRows(spec, entries).map(({ keys, label }) => ({ keys, label }));

    return rows.length === 0 ? [] : [{ title: spec.title, rows }];
  });

  return { letter: part, title: partTitles[part], groups };
};
