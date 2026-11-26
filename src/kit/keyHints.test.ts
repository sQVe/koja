import { describe, expect, test } from 'bun:test';

import type { KeyHintGroup, PartLetter } from './keyHints.ts';
import { isPartLetter, partKeyHints, partLetters } from './keyHints.ts';
import { actionName } from './keyNames.ts';
import { listKeys, normalKeys } from './normalKeys.ts';

const partSequences = (part: PartLetter): string[] => {
  const kept = new Map<string, string[]>();

  for (const entry of normalKeys) {
    if (entry.keys[0] !== part || entry.keys.length !== 2) {
      continue;
    }

    const name = actionName(entry.action);

    if (name === undefined) {
      continue;
    }

    if (!kept.has(name)) {
      kept.set(name, entry.keys);
    }
  }

  return [...kept.values()].map((keys) => keys.join(' '));
};

const cardSequences = (part: PartLetter): string[] =>
  partKeyHints(part).groups.flatMap((group) =>
    group.rows.map((row) => [part, ...row.keys].join(' ')),
  );

const unnamedPartEntries = (part: PartLetter): string[] =>
  normalKeys
    .filter((entry) => entry.keys[0] === part && entry.keys.length === 2)
    .filter((entry) => actionName(entry.action) === undefined)
    .map((entry) => entry.keys.join(' '));

const keysOfGroup = (group: KeyHintGroup): string => {
  const keys = group.rows.map((row) => row.keys.join(''));

  return keys.join(' ');
};

const keysOfGroups = (part: PartLetter): string[] => {
  const groups = partKeyHints(part).groups;

  return groups.map(keysOfGroup);
};

describe('partKeyHints', () => {
  test('each part letter has a card with groups', () => {
    const partsWithoutGroups = partLetters.filter((part) => partKeyHints(part).groups.length === 0);

    expect(partsWithoutGroups).toEqual([]);
  });

  test('a key outside the parts is not a part letter', () => {
    expect(isPartLetter('x')).toBe(false);
  });

  test.each(partLetters)('the %s card lists exactly the keys of its part', (part) => {
    const shown = cardSequences(part).toSorted();
    const expected = partSequences(part).toSorted();

    expect(shown).toEqual(expected);
  });

  test.each(partLetters)('every key of the %s part has a name to list', (part) => {
    expect(unnamedPartEntries(part)).toEqual([]);
  });

  test('the panes card groups focus, move, split, and zoom and close', () => {
    expect(keysOfGroups('w')).toEqual(['h j k l w W p', 'H J K L', 'v s', 'm q o']);
  });

  test('a count names the tab the next key selects', () => {
    const rows = partKeyHints('g', { count: 3 }).groups.flatMap((group) => group.rows);
    const tab = rows.find((row) => row.keys.join('') === 't');

    expect(tab?.label).toBe(actionName({ kind: 'nthTab', index: 3 }));
  });

  test('no count leaves a counted key with its base action', () => {
    for (const options of [{}, { count: null }]) {
      const rows = partKeyHints('g', options).groups.flatMap((group) => group.rows);
      const labels = rows.filter((row) => row.keys.join('') === 't').map((row) => row.label);

      expect(labels).toHaveLength(1);
      expect(labels[0]).toBe(actionName({ kind: 'command', command: 'tab.next' }));
    }
  });

  test.each(partLetters)('the %s card groups every row of its part', (part) => {
    const titles = partKeyHints(part).groups.map((group) => group.title);

    expect(titles).not.toContain('Other');
  });

  test('a marked list shadows the table row of g g', () => {
    const rows = partKeyHints('g', { layer: listKeys }).groups.flatMap((group) => group.rows);
    const shown = rows.filter((row) => row.keys.join('') === 'g');

    expect(shown).toHaveLength(1);
    expect(shown[0]?.label).toBe(actionName({ kind: 'list', action: 'first' }));
  });
});
