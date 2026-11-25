import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

let fontReads = 0;

let currentSettings: Record<string, unknown> = {};

await mock.module('herdr', () =>
  herdrFake({
    settings: () => {
      fontReads += 1;

      return currentSettings;
    },
  }),
);

const modulePath = './terminalFont.ts';

const { terminalFont } = (await import(modulePath)) as { terminalFont: () => string };

afterAll(() => {
  mock.restore();
});

beforeEach(async () => {
  await Promise.resolve();

  currentSettings = { font_family: 'Maple Mono' };
  fontReads = 0;
});

describe('terminalFont', () => {
  test('reads the font family from the settings', () => {
    expect(terminalFont()).toBe('Maple Mono');
    expect(fontReads).toBe(1);
  });

  test('falls back to JetBrains Mono when the setting names no font', () => {
    currentSettings = {};

    expect(terminalFont()).toBe('JetBrains Mono');
  });
});
