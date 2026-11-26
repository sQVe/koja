import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { descendants, drawnTexts } from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';
import { controlSize, paneHeaderWidth } from '../../kit/size.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

const kitFake = await mockGalleryModules({ shared: () => undefined });

await mock.module('../../kit/index.ts', () => kitFake);

const { sidebarParts } = await import('./sidebarParts.ts');

afterAll(() => {
  mock.restore();
});

const label = 'Fact lines: a short value, a long cut value, and a row with no facts';

const longValue = 'me-1181-find-a-space-by-pr-ticket-or-branch-in-the-picker';

const specimen = (): DrawnElement => {
  const parts = sidebarParts() as unknown as DrawnElement[];
  const found = parts.find((part) => drawnTexts(part).includes(label));

  if (found === undefined) {
    throw new Error(`The gallery has no sample named ${label}.`);
  }

  return found;
};

describe('gallery fact line specimen', () => {
  test('passes three values, the long one long enough to be cut', () => {
    const part = specimen();
    const texts = drawnTexts(part);
    const shownCharacters = Math.floor(controlSize.factValueMaxWidth / paneHeaderWidth.glyph);

    expect(texts).toContain('add-search');
    expect(texts).toContain(longValue);
    expect(texts).toContain('fix-crash');
    expect(longValue.length).toBeGreaterThan(shownCharacters);
  });

  test('draws the value without facts after the values that have them', () => {
    const part = specimen();
    const texts = drawnTexts(part);
    const gaps = descendants(part).filter((element) => element.texts.includes('·'));

    expect(texts.indexOf('fix-crash')).toBeGreaterThan(texts.indexOf(longValue));
    expect(gaps).toHaveLength(4);
  });
});
