import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

let currentSettings: Record<string, unknown> = {};

await mock.module('herdr', () => herdrFake({ settings: () => currentSettings }));

const modulePath = './terminalFont.ts';

const { terminalFont } = (await import(modulePath)) as { terminalFont: () => string };

afterAll(() => {
  mock.restore();
});

beforeEach(async () => {
  // perTurn clears its cache in a microtask, so wait for it before the next test reads.
  await Promise.resolve();

  currentSettings = { font_family: 'Maple Mono' };
});

describe('terminalFont', () => {
  test('reads the font family from the settings', () => {
    expect(terminalFont()).toBe('Maple Mono');
  });

  test('falls back to JetBrains Mono when the setting names no font', () => {
    currentSettings = {};

    expect(terminalFont()).toBe('JetBrains Mono');
  });
});
