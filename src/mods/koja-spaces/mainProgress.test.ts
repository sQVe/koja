import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { descendants, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  anotherOwner,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  state,
} from '../../../tests/kojaSpacesView.ts';
import { rowOf, useStackSpaces } from '../../../tests/stackViewFixtures.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const positionOfText = (row: DrawnElement, text: string): number =>
  descendants(row).findIndex((part) => part.texts.includes(text));

const positionOfIcon = (row: DrawnElement, name: string): number =>
  descendants(row).findIndex((part) => part.path?.endsWith(name) === true);

describe('koja-spaces row progress', () => {
  test("a stack space's row shows merged over total before its work icon", async () => {
    anotherOwner();
    useStackSpaces(true);

    const view = await loadView();
    const row = rowOf(view, 'w');

    const countAt = positionOfText(row, '1/3');
    const iconAt = positionOfIcon(row, 'circle-x.svg');

    expect(countAt).toBeGreaterThan(-1);
    expect(iconAt).toBeGreaterThan(countAt);
    expect(drawnTexts(row)).toContain('1/3');
  });

  test('a space outside any stack shows no count', async () => {
    anotherOwner();
    useStackSpaces(false);

    const view = await loadView();
    const counts = drawnTexts(rowOf(view, 'w')).filter((text) => /^\d+\/\d+$/.test(text));

    expect(counts).toEqual([]);
  });

  test('the Inbox row shows the same count', async () => {
    anotherOwner();
    useStackSpaces(true);
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    expect(drawnTexts(rowOf(view, 'w'))).toContain('1/3');
  });
});
