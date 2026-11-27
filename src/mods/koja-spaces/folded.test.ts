import { describe, expect, test } from 'bun:test';

import { memoryStore } from '../../../tests/memoryStore.ts';
import { foldedSet } from './folded.ts';

describe('foldedSet', () => {
  test('toggles an item on and off, persisting each time', () => {
    const { values, store: storage } = memoryStore();
    const folded = foldedSet('machines.folded', storage);

    expect(folded.has('work')).toBe(false);

    folded.toggle('work');

    expect(folded.has('work')).toBe(true);
    expect(values['machines.folded']).toBe('["work"]');

    folded.toggle('work');

    expect(folded.has('work')).toBe(false);
    expect(values['machines.folded']).toBe('[]');
  });

  test('recovers from invalid saved JSON and persists a later toggle', () => {
    const { values, store: storage } = memoryStore();

    storage.set('repos.folded', '{{{not json');

    const folded = foldedSet('repos.folded', storage);

    expect(folded.has('a')).toBe(false);

    folded.toggle('a');

    expect(folded.has('a')).toBe(true);
    expect(values['repos.folded']).toBe('["a"]');
  });

  test('reads an existing folded set', () => {
    const { store: storage } = memoryStore();

    storage.set('repos.folded', '["a","b"]');

    const folded = foldedSet('repos.folded', storage);

    expect(folded.has('b')).toBe(true);
    expect(folded.has('c')).toBe(false);
  });

  test('drops saved items that are not strings', () => {
    const { values, store: storage } = memoryStore();

    storage.set('repos.folded', '["a",1,null,{"b":true},["c"],"d"]');

    const folded = foldedSet('repos.folded', storage);

    expect(folded.has('a')).toBe(true);
    expect(folded.has('d')).toBe(true);

    folded.toggle('e');

    expect(values['repos.folded']).toBe('["a","d","e"]');
  });
});
