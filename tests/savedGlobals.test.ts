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
    expect(absentName in globalThis).toBe(false);
  });

  test('a restore leaves the saved map empty so a second setup saves again', () => {
    setGlobal(presentName, 'first');

    const first = saveGlobals([presentName]);

    setGlobal(presentName, 'changed');
    restoreGlobals(first);

    expect(first.size).toBe(0);

    setGlobal(presentName, 'second');

    const second = saveGlobals([presentName]);

    setGlobal(presentName, 'third');
    restoreGlobals(second);

    expect(globalValue(presentName)).toBe('second');
  });
});
