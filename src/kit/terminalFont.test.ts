import { afterAll, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

let fontReads = 0;

let currentSettings: Record<string, unknown> = { font_family: 'Maple Mono' };

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

describe('terminalFont', () => {
  test('reads the setting once however many caps one turn draws', async () => {
    await Promise.resolve();
    fontReads = 0;

    expect(terminalFont()).toBe('Maple Mono');
    expect(terminalFont()).toBe('Maple Mono');
    expect(fontReads).toBe(1);
  });

  test('reads a font the user changed before the next turn', async () => {
    terminalFont();
    currentSettings = { font_family: 'Fira Code' };
    await Promise.resolve();

    expect(terminalFont()).toBe('Fira Code');
  });

  test('falls back to JetBrains Mono when the setting names no font', async () => {
    await Promise.resolve();
    currentSettings = {};

    expect(terminalFont()).toBe('JetBrains Mono');
  });
});
