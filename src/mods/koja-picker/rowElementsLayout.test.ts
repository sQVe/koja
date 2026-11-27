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

const rowWithText = (element: DrawnElement, text: string): DrawnElement => {
  const row = element.kids.find((kid) => drawnTexts(kid).includes(text));

  if (row === undefined) {
    throw new Error(`no row with ${text}`);
  }

  return row;
};

describe('list layout under a status filter', () => {
  test('a filtered pane without a tab row aligns with other direct children', () => {
    const data = compoundFilterFixture();
    const drawn = listOf('', data, ['done', 'blocked']);

    const pane = rowWithText(drawn, 'zsh · title p1');
    const tab = rowWithText(drawn, 'zsh');

    expect(numberStyle(pane, 'pl')).toBe(numberStyle(tab, 'pl'));
  });
});

describe('list layout without a status filter', () => {
  test('a pane under a shown tab row indents past that row', () => {
    const data = compoundFilterFixture();
    const drawn = listOf('', data);

    const pane = rowWithText(drawn, 'zsh · title p1');
    const tab = rowWithText(drawn, 'zsh');

    expect(numberStyle(pane, 'pl')).toBeGreaterThan(numberStyle(tab, 'pl'));
  });
});
