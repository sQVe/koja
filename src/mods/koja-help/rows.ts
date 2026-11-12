import { actionName } from '../../kit/keyNames.ts';
import type { NormalKey } from '../../kit/normalKeys.ts';
import { listKeys, normalKeys } from '../../kit/normalKeys.ts';

type Part = 'w' | 't' | 's' | 'g' | 'z';

export type HelpGroupId = Part | 'single' | 'list';

export interface HelpRow {
  name: string;
  keys: string[][];
}

export interface HelpGroup {
  id: HelpGroupId;
  title: string;
  note?: string;
  rows: HelpRow[];
}

const parts: Part[] = ['w', 't', 's', 'g', 'z'];

const partTitles: Record<Part, string> = {
  w: 'Panes',
  t: 'Tabs',
  s: 'Spaces',
  g: 'Go to',
  z: 'View',
};

const controlWindowNote = 'Every key here also works after ctrl-w.';

const listNote = 'While a section with a list is marked.';

const isControlWindowKey = (key: NormalKey): boolean => key.keys[0] === 'ctrl-w';

const partOf = (key: NormalKey): Part | undefined => {
  if (key.keys.length < 2) {
    return undefined;
  }

  return parts.find((part) => part === key.keys[0]);
};

const rowsOf = (keys: readonly NormalKey[]): HelpRow[] => {
  const rows = new Map<string, HelpRow>();

  for (const key of keys) {
    const name = actionName(key.action);

    if (name === undefined) {
      continue;
    }

    const row = rows.get(name) ?? { name, keys: [] };

    row.keys.push([...key.keys]);
    rows.set(name, row);
  }

  return [...rows.values()];
};

const allGroups = (): HelpGroup[] => {
  const listed = normalKeys.filter((key) => !isControlWindowKey(key));

  const partGroup = (part: Part): HelpGroup => ({
    id: part,
    title: partTitles[part],
    ...(part === 'w' ? { note: controlWindowNote } : {}),
    rows: rowsOf(listed.filter((key) => partOf(key) === part)),
  });

  const singleKeys = listed.filter((key) => partOf(key) === undefined);

  return [
    ...parts.map(partGroup),
    { id: 'single', title: 'Single keys', rows: rowsOf(singleKeys) },
    { id: 'list', title: 'Lists', note: listNote, rows: rowsOf(listKeys) },
  ];
};

// A key sequence matches only from its start, so that "space" does not find `backspace`.
const startsSequence = (keys: readonly string[], query: string): boolean =>
  keys.join(' ').toLowerCase().startsWith(query);

const matches = (row: HelpRow, query: string): boolean => {
  if (row.name.toLowerCase().includes(query)) {
    return true;
  }

  return row.keys.some((keys) => startsSequence(keys, query));
};

export const helpGroups = (query: string): HelpGroup[] => {
  const lowered = query.toLowerCase();

  const groups = allGroups();

  for (const group of groups) {
    group.rows = group.rows.filter((row) => matches(row, lowered));
  }

  return groups.filter((group) => group.rows.length > 0);
};
