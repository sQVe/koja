import { afterAll, describe, expect, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawnTexts, numberStyle } from '../../../tests/drawn.ts';
import { paneOf, pickerData, spaceOf, tabOf } from '../../../tests/pickerFixtures.ts';
import { restorePickerRows, setupPickerRows } from '../../../tests/pickerRowsView.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

await setupPickerRows();

const { list } = (await import('./rowElements.ts')) as unknown as {
  list: (
    rows: ReturnType<typeof buildRows>,
    query: string,
    selectedKey: string | null,
    data: PickerData,
    scroll: unknown,
    onItemClick: (key: string) => void,
  ) => DrawnElement;
};

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
    const rows = buildRows('', ['done', 'blocked'], data);
    const drawn = list(rows, '', null, data, {}, () => undefined);

    const pane = rowWithText(drawn, 'zsh · title p1');
    const tab = rowWithText(drawn, 'zsh');

    expect(numberStyle(pane, 'pl')).toBe(numberStyle(tab, 'pl'));
  });
});
