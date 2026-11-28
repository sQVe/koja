import { afterAll, describe, expect, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawnTexts, numberStyle } from '../../../tests/drawn.ts';
import { paneOf, pickerData, spaceOf, tabOf } from '../../../tests/pickerFixtures.ts';
import { restorePickerRows, setupPickerRows } from '../../../tests/pickerRowsView.ts';
import type { PickerData } from './rows.ts';

const { listOf } = await setupPickerRows();

afterAll(() => {
  restorePickerRows();
});

const compoundFilterFixture = (): PickerData =>
  pickerData({
    spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
    panes: [
      paneOf('p1', 'k1', 'done'),
      paneOf('p2', 'k1', 'working'),
      paneOf('p3', 'k2', 'blocked'),
    ],
  });

const rowMatching = (
  element: DrawnElement,
  matches: (kid: DrawnElement) => boolean,
  description: string,
): DrawnElement => {
  const row = element.kids.find(matches);

  if (row === undefined) {
    throw new Error(`no row ${description}`);
  }

  return row;
};

const hasText =
  (text: string) =>
  (kid: DrawnElement): boolean =>
    drawnTexts(kid).includes(text);

const hasOnlyText =
  (text: string) =>
  (kid: DrawnElement): boolean => {
    const texts = drawnTexts(kid);

    return texts.length === 1 && texts[0] === text;
  };

describe('list layout under a status filter', () => {
  test('a filtered pane without a tab row aligns with other direct children', () => {
    const data = compoundFilterFixture();
    const drawn = listOf('', data, ['done', 'blocked']);

    const pane = rowMatching(drawn, hasText('zsh · title p1'), 'with zsh · title p1');
    const tabRows = drawn.kids.filter(hasText('zsh'));
    const tabRow = rowMatching(drawn, hasOnlyText('zsh'), 'with only zsh');

    expect(tabRows).toHaveLength(1);
    expect(numberStyle(pane, 'pl')).toBe(numberStyle(tabRow, 'pl'));
  });
});

describe('list layout without a status filter', () => {
  test('a pane under a shown tab row indents past that row', () => {
    const data = compoundFilterFixture();
    const drawn = listOf('', data);

    const pane = rowMatching(drawn, hasText('zsh · title p1'), 'with zsh · title p1');
    const tabRow = rowMatching(drawn, hasOnlyText('zsh'), 'with only zsh');

    expect(numberStyle(pane, 'pl')).toBeGreaterThan(numberStyle(tabRow, 'pl'));
  });
});
