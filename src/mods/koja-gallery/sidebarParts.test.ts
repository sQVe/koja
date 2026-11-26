import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  descendants,
  drawnTexts,
  elementAroundText,
  elementWithText,
  numberStyle,
} from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';
import { controlSize } from '../../kit/size.ts';

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

const factRowOf = (part: DrawnElement, value: string): DrawnElement => {
  const row = elementAroundText(part, value);

  if (row === null) {
    throw new Error(`The specimen draws no fact row for ${value}.`);
  }

  return row;
};

const separatorsIn = (part: DrawnElement, value: string): number =>
  descendants(factRowOf(part, value)).filter((element) => element.texts.includes('·')).length;

describe('gallery fact line specimen', () => {
  test('draws the three values with the long one capped', () => {
    const part = specimen();
    const texts = drawnTexts(part);
    const long = elementWithText(part, longValue);

    expect(texts).toContain('add-search');
    expect(texts).toContain(longValue);
    expect(texts).toContain('fix-crash');
    expect(numberStyle(long ?? undefined, 'max_w')).toBe(controlSize.factValueMaxWidth);
  });

  test('draws the value without facts after the values that have them', () => {
    const part = specimen();
    const texts = drawnTexts(part);

    expect(texts).toContain(longValue);
    expect(texts).toContain('fix-crash');
    expect(texts.indexOf('fix-crash')).toBeGreaterThan(texts.indexOf(longValue));
  });

  test('gives each specimen row its own facts', () => {
    const part = specimen();

    expect(separatorsIn(part, 'add-search')).toBe(2);
    expect(separatorsIn(part, longValue)).toBe(2);
    expect(separatorsIn(part, 'fix-crash')).toBe(0);
  });
});
