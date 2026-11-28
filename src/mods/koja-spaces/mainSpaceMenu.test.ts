import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  state,
} from '../../../tests/kojaSpacesView.ts';
import { rowOf, useStackLinks } from '../../../tests/stackViewFixtures.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const context = { notify: () => undefined, stop_propagation: () => undefined };

const rightPress = (view: FakeView, id: string): void => {
  for (const handler of rowOf(view, id).mouseHandlers['on_mouse_down:right'] ?? []) {
    handler({}, context);
  }
};

const rowLinks = {
  tab: 'space',
  target: { id: 'w' },
  ticket: { id: 'ME-3', url: 'https://linear.app/koja/issue/ME-3' },
  pull: { number: 505, url: 'https://github.com/example/example/pull/505' },
  branch: 'me-3-top',
};

describe('koja-spaces space menu links', () => {
  test('right-clicking a stack space row opens the menu with its links', async () => {
    useStackLinks();

    const view = await loadView();

    rightPress(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });

  test('right-clicking a project header opens the menu with its main space links', async () => {
    useStackLinks();

    const view = await loadView();

    rightPress(view, 'm');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({
        mod: 'koja-menu',
        props: {
          tab: 'space',
          target: { id: 'm' },
          ticket: { id: 'ME-4', url: 'https://linear.app/koja/issue/ME-4' },
          pull: { number: 506, url: 'https://github.com/example/example/pull/506' },
          branch: 'me-4-header',
        },
      }),
    ]);
  });

  test('an Inbox row opens the menu with the same links', async () => {
    useStackLinks();
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    rightPress(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });
});
