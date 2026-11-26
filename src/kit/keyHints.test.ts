import { describe, expect, test } from 'bun:test';

import type { KeyHintGroup, PartLetter } from './keyHints.ts';
import { isPartLetter, partKeyHints, partLetters } from './keyHints.ts';
import { actionName } from './keyNames.ts';
import { normalKeys } from './normalKeys.ts';

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

    const shown = kept.get(name);

    if (shown === undefined || entry.keys.length < shown.length) {
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
  test('each part letter is known', () => {
    expect(partLetters.filter((part) => !isPartLetter(part))).toEqual([]);
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

  test('a row shows a key sequence of its own part, never a ctrl-w alias', () => {
    const foreign = partLetters.flatMap((part) =>
      cardSequences(part).filter((sequence) => !sequence.startsWith(`${part} `)),
    );

    expect(foreign).toEqual([]);
  });
});
