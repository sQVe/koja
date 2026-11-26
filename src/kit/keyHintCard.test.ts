import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { partKeyHints } from './keyHints.ts';
import type { PartKeyHints } from './keyHints.ts';
import { isUpperCaseLetter } from './keys.ts';

const palette = {
  border: '#999ca7',
  popover: '#dcdee5',
  selected: '#c6c9d1',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () =>
  herdrFake({ settings: () => ({ font_family: 'Maple Mono' }), theme: () => palette }),
);

const modulePath = './keyHintCard.ts';

const { keyHintCard } = (await import(modulePath)) as {
  keyHintCard: (hints: PartKeyHints) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const keyLabel = (key: string): string => (isUpperCaseLetter(key) ? `⇧${key}` : key);

describe('keyHintCard', () => {
  test('the card names the part and draws every key of its rows', () => {
    const hints = partKeyHints('w');
    const texts = drawnTexts(keyHintCard(hints));

    const missing = hints.groups
      .flatMap((group) => group.rows.flatMap((row) => row.keys))
      .map(keyLabel)
      .filter((label) => !texts.includes(label));

    expect(texts).toContain('w');
    expect(texts).toContain('Panes');
    expect(missing).toEqual([]);
  });

  test('a part with one group still draws the keys of that group', () => {
    const hints = partKeyHints('z');
    const texts = drawnTexts(keyHintCard(hints));

    const missing = hints.groups
      .flatMap((group) => group.rows.flatMap((row) => row.keys))
      .map(keyLabel)
      .filter((label) => !texts.includes(label));

    expect(texts).toContain('View');
    expect(missing).toEqual([]);
  });
});
