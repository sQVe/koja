import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { drawnTexts, elementsWithMouseHandlers, press } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  cursorNames,
  listChildren,
  loadView,
  pressable,
  resetKojaSpaces,
  restoreKojaSpaces,
  selected,
  send,
  setupKojaSpaces,
  showFacts,
  space,
  spaceNames,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const useRepository = (): void => {
  showFacts(
    storedFacts([
      { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
      { folder: '/code/koja-fix', commonDirectory: '/code/koja/.git', linked: true },
    ]),
  );

  state.spaceList = [space('w', true, '/code/koja-fix'), space('m', false, '/code/koja')];
};

const headerOf = (view: FakeView): DrawnElement | undefined =>
  elementsWithMouseHandlers(view.render())
    .filter(pressable)
    .find((element) => drawnTexts(element).includes('koja'));

describe('koja-spaces main space header', () => {
  test('draws the main space as the header, not as a row', async () => {
    useRepository();

    const view = await loadView();

    expect(spaceNames(view)).toEqual(['name-w']);

    const kojaTexts = listChildren(view)
      .flatMap(drawnTexts)
      .filter((text) => text === 'koja');

    expect(kojaTexts).toHaveLength(1);
  });

  test('a click on the header selects the main space', async () => {
    useRepository();

    const view = await loadView();

    press(headerOf(view) as DrawnElement, {
      notify: () => undefined,
      stop_propagation: () => undefined,
    });

    expect(selected()).toEqual(['m']);
  });

  test('the cursor stops on the header and list-open selects the main space', async () => {
    useRepository();

    const view = await loadView();

    await send('list-first');

    expect(cursorNames(view)).toEqual(['koja']);

    await send('list-open');

    expect(selected()).toEqual(['m']);
  });

  test('publishes the main space once, at the header, and as the root', async () => {
    useRepository();

    await loadView();

    expect(state.sharedValues['spaces.order']).toEqual({
      shown: ['m', 'w'],
      hidden: [],
      roots: ['m'],
    });
  });
});
