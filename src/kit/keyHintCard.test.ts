import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementsWithStyle } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { partKeyHints, partLetters } from './keyHints.ts';
import type { PartKeyHints, PartLetter } from './keyHints.ts';
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

// Only the keycap glyphs draw with the terminal font, so this reads the card's keys and no other text.
const drawnKeys = (part: PartLetter): string[] =>
  elementsWithStyle(keyHintCard(partKeyHints(part)), 'font_family')
    .flatMap((element) => drawnTexts(element))
    .toSorted();

const expectedKeys = (part: PartLetter): string[] => {
  const rows = partKeyHints(part).groups.flatMap((group) => group.rows);

  return [part, ...rows.flatMap((row) => row.keys)].map(keyLabel).toSorted();
};

describe('keyHintCard', () => {
  test.each(partLetters)('the %s card draws exactly the keys of its part', (part) => {
    expect(drawnKeys(part)).toEqual(expectedKeys(part));
  });

  test('the card names the part beside its pressed key', () => {
    const texts = drawnTexts(keyHintCard(partKeyHints('w')));

    expect(texts).toContain('Panes');
  });
});
