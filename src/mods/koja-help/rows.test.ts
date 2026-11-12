import { describe, expect, test } from 'bun:test';

import { actionName } from '../../kit/keyNames.ts';
import type { NormalKey } from '../../kit/normalKeys.ts';
import { listKeys, normalKeys } from '../../kit/normalKeys.ts';
import type { HelpGroup, HelpGroupId, HelpRow } from './rows.ts';
import { helpGroups } from './rows.ts';

const sequenceOf = (keys: string[]): string => keys.join(' ');

const sequencesOf = (row: HelpRow): string[] => row.keys.map(sequenceOf);

const rowsOf = (groups: HelpGroup[]): HelpRow[] => groups.flatMap((group) => group.rows);

const groupOf = (groups: HelpGroup[], id: HelpGroupId): HelpGroup | undefined =>
  groups.find((group) => group.id === id);

const isControlWindowKey = (key: NormalKey): boolean => key.keys[0] === 'ctrl-w';

const missingFrom = (rows: HelpRow[], key: NormalKey): string[] => {
  const name = actionName(key.action);
  const sequence = sequenceOf(key.keys);
  const named = rows.filter((row) => row.name === name);

  const found = isControlWindowKey(key)
    ? named.length > 0
    : named.some((row) => sequencesOf(row).includes(sequence));

  return found ? [] : [sequence];
};

describe('helpGroups', () => {
  test('every row of the key table has an entry in the help', () => {
    const groups = helpGroups('');
    const listRows = groupOf(groups, 'list')?.rows ?? [];
    const windowRows = groupOf(groups, 'w')?.rows ?? [];
    const normalRows = rowsOf(groups.filter((group) => group.id !== 'list'));

    const rowsFor = (key: NormalKey): HelpRow[] =>
      isControlWindowKey(key) ? windowRows : normalRows;

    const missing = [
      ...normalKeys.flatMap((key) => missingFrom(rowsFor(key), key)),
      ...listKeys.flatMap((key) => missingFrom(listRows, key)),
    ];

    expect(missing).toEqual([]);
  });

  test('lists the groups in the order of the parts, then single keys, then list keys', () => {
    expect(helpGroups('').map((group) => group.id)).toEqual([
      'w',
      't',
      's',
      'g',
      'z',
      'single',
      'list',
    ]);
  });

  test('puts a sequence in the group of its first key', () => {
    const groups = helpGroups('');

    const misplaced = groups
      .filter((group) => group.id !== 'single' && group.id !== 'list')
      .flatMap((group) =>
        group.rows.flatMap((row) => row.keys.filter((keys) => keys[0] !== group.id)),
      );

    const single = groupOf(groups, 'single')?.rows ?? [];
    const long = single.flatMap((row) => row.keys.filter((keys) => keys.length > 1));

    expect(misplaced).toEqual([]);
    expect(long).toEqual([]);
  });

  test('gives one row per action name with every key sequence of that action', () => {
    const single = groupOf(helpGroups(''), 'single')?.rows ?? [];
    const focusLeft = single.filter((row) => row.name === 'Focus pane left');

    expect(focusLeft).toEqual([
      { name: 'Focus pane left', keys: [['h'], ['ctrl-h'], ['left'], ['ctrl-left']] },
    ]);
  });

  test('keeps only rows whose name contains the query', () => {
    const rows = rowsOf(helpGroups('space'));
    const unrelated = rows.filter((row) => !row.name.toLowerCase().includes('space'));

    expect(unrelated).toEqual([]);
    expect(rows).toContainEqual({ name: 'Next space', keys: [['s', 'j']] });
  });

  test('keeps rows with a key sequence that starts with the query', () => {
    const sequences = rowsOf(helpGroups('s j')).flatMap(sequencesOf);

    expect(sequences).toEqual(['s j']);
  });

  test('does not match the middle of a key name', () => {
    expect(rowsOf(helpGroups('space')).flatMap(sequencesOf)).not.toContain('backspace');
  });

  test('matches a query without case', () => {
    expect(rowsOf(helpGroups('NEXT SPACE'))).toEqual([{ name: 'Next space', keys: [['s', 'j']] }]);
    expect(rowsOf(helpGroups('g t')).flatMap(sequencesOf)).toContain('g T');
  });

  test('drops a group that the query leaves empty', () => {
    expect(helpGroups('next space').map((group) => group.id)).toEqual(['s']);
  });

  test('gives no group for a query that matches nothing', () => {
    expect(helpGroups('no such key')).toEqual([]);
  });

  test('lists no ctrl-w sequence and notes them on the w group instead', () => {
    const groups = helpGroups('');

    const controlWindow = rowsOf(groups)
      .flatMap((row) => row.keys)
      .filter((keys) => keys[0] === 'ctrl-w');

    const noted = groups.filter((group) => group.note?.includes('ctrl-w') === true);

    expect(controlWindow).toEqual([]);
    expect(noted.map((group) => group.id)).toEqual(['w']);
  });
});
