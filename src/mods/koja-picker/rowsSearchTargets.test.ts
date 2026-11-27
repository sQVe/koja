import { describe, expect, test } from 'bun:test';

import { paneOf, pickerData, spaceOf, tabOf } from '../../../tests/pickerFixtures.ts';
import type { PickerData } from './rows.ts';
import { buildRows, rowPane } from './rows.ts';

const keysOf = (rows: { key: string }[]): string[] => rows.map((row) => row.key);

const hiddenPaneFixture = (): PickerData =>
  pickerData({
    spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
    panes: [paneOf('p1', 'k1', 'working'), { ...paneOf('p2', 'k2', 'idle'), title: 'needle' }],
  });

const rankedFixture = (): PickerData =>
  pickerData({
    spaces: [
      spaceOf('a', 1, 'alpha', [tabOf('a1', 1, true)]),
      spaceOf('b', 2, 'beta', [tabOf('b1', 1, true)]),
    ],
    panes: [
      { ...paneOf('p1', 'a1', 'working'), title: 'n-e-e-d-l-e' },
      { ...paneOf('p2', 'a1', 'idle'), title: 'needle' },
      { ...paneOf('p3', 'b1', 'working'), title: 'needle' },
    ],
  });

const blockedFixture = (): PickerData =>
  pickerData({
    spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true)])],
    panes: [paneOf('p1', 'k1', 'blocked'), { ...paneOf('p2', 'k1', 'blocked'), title: 'needle' }],
  });

const backgroundFixture = (): PickerData =>
  pickerData(
    {
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)])],
      panes: [paneOf('p1', 'k1', 'idle'), { ...paneOf('p2', 'k1', 'idle'), focused: true }],
    },
    [
      { address: 't-child', parent: 't-p1', status: 'idle' },
      { address: 't-grandchild', parent: 't-child', status: 'working' },
    ],
  );

describe('buildRows search under a status filter', () => {
  test('a filtered space does not qualify through a hidden pane or tab', () => {
    expect(keysOf(buildRows('needle', ['working'], hiddenPaneFixture()))).toStrictEqual([]);
  });

  test('a hidden stronger hit does not outrank a visible stronger hit', () => {
    expect(keysOf(buildRows('needle', ['working'], rankedFixture()))).toStrictEqual([
      'space:b',
      'space:a',
      'pane:p1',
    ]);
  });

  test('a query chooses the unique best pane within the active status', () => {
    const fixture = blockedFixture();
    const [spaceRow] = buildRows('needle', ['blocked'], fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p2');
  });

  test('a background-only status targets the pane that owns the descendant', () => {
    const fixture = backgroundFixture();
    const rows = buildRows('', ['working'], fixture);

    const spaceRow = rows.find((row) => row.key === 'space:s1');
    const tabRow = rows.find((row) => row.key === 'tab:k1');

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p1');
    expect(rowPane(tabRow, fixture)?.pane).toBe('p1');
  });

  test('an empty query under a filter keeps the first eligible pane', () => {
    const fixture = pickerData({
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true)])],
      panes: [paneOf('p1', 'k1', 'blocked'), paneOf('p2', 'k1', 'blocked')],
    });

    const [spaceRow] = buildRows('', ['blocked'], fixture);

    expect(rowPane(spaceRow, fixture)?.pane).toBe('p1');
  });
});
