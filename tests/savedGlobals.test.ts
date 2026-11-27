import { afterEach, describe, expect, test } from 'bun:test';

import { restoreGlobals, saveGlobals } from './savedGlobals.ts';

const presentName = 'kojaSavedGlobalsPresent';
const absentName = 'kojaSavedGlobalsAbsent';

const setGlobal = (name: string, value: string): void => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
};

const globalValue = (name: string): unknown =>
  Object.getOwnPropertyDescriptor(globalThis, name)?.value;

afterEach(() => {
  Reflect.deleteProperty(globalThis, presentName);
  Reflect.deleteProperty(globalThis, absentName);
});

describe('the saved globals', () => {
  test('a restore puts back a saved global and deletes one that was absent', () => {
    setGlobal(presentName, 'before');

    const saved = saveGlobals([presentName, absentName]);

    setGlobal(presentName, 'during');
    setGlobal(absentName, 'added');

    restoreGlobals(saved);

    expect(globalValue(presentName)).toBe('before');
    expect(Object.hasOwn(globalThis, absentName)).toBe(false);
  });

  test('a restore empties the saved map so restoring it again changes nothing', () => {
    setGlobal(presentName, 'before');

    const saved = saveGlobals([presentName]);

    setGlobal(presentName, 'during');
    restoreGlobals(saved);

    expect(saved.size).toBe(0);

    setGlobal(presentName, 'after');
    restoreGlobals(saved);

    expect(globalValue(presentName)).toBe('after');
  });
});
