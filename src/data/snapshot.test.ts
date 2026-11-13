import { describe, expect, test } from 'bun:test';

import type { Snapshot } from './snapshot.ts';
import { parseSnapshot } from './snapshot.ts';

const snapshot = { version: 1, revision: 4, facts: {} } satisfies Snapshot;

describe('parseSnapshot', () => {
  test('accepts a version 1 snapshot', () => {
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
  });

  test('rejects a wrong version', () => {
    expect(parseSnapshot({ ...snapshot, version: 2 })).toBeNull();
  });

  test('rejects a missing revision', () => {
    expect(parseSnapshot({ version: 1, facts: {} })).toBeNull();
  });

  test('rejects missing facts', () => {
    expect(parseSnapshot({ version: 1, revision: 4 })).toBeNull();
  });

  test('rejects a revision that is not a positive whole number', () => {
    expect(parseSnapshot({ ...snapshot, revision: 0 })).toBeNull();
    expect(parseSnapshot({ ...snapshot, revision: 1.5 })).toBeNull();
    expect(parseSnapshot({ ...snapshot, revision: '4' })).toBeNull();
  });

  test('rejects facts that are not an empty object', () => {
    expect(parseSnapshot({ ...snapshot, facts: [] })).toBeNull();
    expect(parseSnapshot({ ...snapshot, facts: { pulls: 1 } })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseSnapshot('snapshot')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([snapshot])).toBeNull();
  });
});
