import { afterAll, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

let currentTheme: Record<string, string> = { foreground: '#111111' };

let themeReads = 0;

await mock.module('herdr', () =>
  herdrFake({
    theme: () => {
      themeReads += 1;

      return currentTheme;
    },
  }),
);

const modulePath = './theme.ts';

const { colors } = (await import(modulePath)) as {
  colors: () => { foreground: string };
};

afterAll(() => {
  mock.restore();
});

describe('colors', () => {
  test('reads the theme once however many colors one turn asks for', async () => {
    await Promise.resolve();
    themeReads = 0;

    const first = colors();
    const second = colors();

    expect(first.foreground).toBe('#111111');
    expect(second.foreground).toBe('#111111');
    expect(themeReads).toBe(1);
  });

  test('reads a theme the user changed before the next turn', async () => {
    colors();
    currentTheme = { foreground: '#222222' };
    await Promise.resolve();

    expect(colors().foreground).toBe('#222222');
  });
});
