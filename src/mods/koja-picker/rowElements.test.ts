import { afterAll, describe, expect, test } from 'bun:test';

import { drawnIcons, drawnTexts, elementWithText } from '../../../tests/drawn.ts';
import {
  factsWithStack,
  mergedStack,
  pickerData,
  spaceOf,
  stackOf,
  tabOf,
  ticketStack,
} from '../../../tests/pickerFixtures.ts';
import { restorePickerRows, setupPickerRows } from '../../../tests/pickerRowsView.ts';
import type { PickerData } from './rows.ts';

const { listOf } = await setupPickerRows();

afterAll(() => {
  restorePickerRows();
});

const dataWith = (): PickerData => {
  const stored = factsWithStack('/home/me/koja', mergedStack());

  return pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    stored,
    facts: { a: { project: 'koja', pull: null, need: null } },
  });
};

const dataWithState = (state: 'open' | 'unknown'): PickerData => {
  const base = ticketStack();

  const pulls = base.pulls.map((pull, index) =>
    index === 1 ? Object.assign({}, pull, { state }) : pull,
  );

  return pickerData({
    spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
    panes: [],
    stored: factsWithStack('/home/me/koja', stackOf(pulls)),
  });
};

describe('list with a stack reason', () => {
  test('a found space row draws its reason', () => {
    const found = listOf('504', dataWith());

    expect(elementWithText(found, '#504')).not.toBeNull();
  });

  test('a name-matched row draws the name and no stack reason', () => {
    const data = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack('/home/me/koja', mergedStack()),
    });

    const named = listOf('koja', data);

    expect(elementWithText(named, 'koja')).not.toBeNull();
    expect(elementWithText(named, '#504')).toBeNull();
  });

  test('a reason and a work icon both draw on a row with a need', () => {
    const data = pickerData({
      spaces: [spaceOf('a', 1, 'koja', [tabOf('a1', 1, true)])],
      panes: [],
      stored: factsWithStack('/home/me/koja', mergedStack()),
      facts: { a: { project: 'koja', pull: 504, need: 'review' } },
    });

    const found = listOf('504', data);

    expect(elementWithText(found, '#504')).not.toBeNull();
    expect(elementWithText(found, 'PR 2 of 8')).not.toBeNull();
    expect(drawnIcons(found)).toContain('message-square.svg');
  });

  test('a reason with an unknown state leaves out the state', () => {
    const reasonTexts = (data: PickerData): string[] =>
      drawnTexts(listOf('ME-1182', data)).filter((text) => text !== 'koja');

    const unknown = reasonTexts(dataWithState('unknown'));
    const known = reasonTexts(dataWithState('open'));

    expect(unknown).toContain('PR 2 of 3');
    expect(unknown).not.toContain('open');
    expect(known).toContain('open');
  });
});
