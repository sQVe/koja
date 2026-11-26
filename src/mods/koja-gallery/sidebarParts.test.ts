import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  descendants,
  drawnTexts,
  drawnTooltips,
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

describe('gallery fact line specimen', () => {
  test('caps the long value and shows the whole value on hover', () => {
    const long = elementWithText(specimen(), longValue);

    if (long === null) {
      throw new Error('The specimen draws no long value.');
    }

    expect(numberStyle(long, 'max_w')).toBe(controlSize.factValueMaxWidth);
    expect(drawnTooltips(long)).toEqual([longValue]);
  });

  test('draws a value without facts after the values that have them', () => {
    const part = specimen();
    const gaps = descendants(part).filter((element) => element.texts.includes('·'));

    expect(elementWithText(part, 'add-search')).not.toBeNull();
    expect(elementWithText(part, 'fix-crash')).not.toBeNull();
    expect(gaps).toHaveLength(4);
  });
});
