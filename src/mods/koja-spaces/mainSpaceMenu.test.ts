import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { elementsWithId } from '../../../tests/drawn.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
  anotherOwner,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  showFacts,
  space,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { pullFacts, readyPull } from '../../../tests/pullFacts.ts';
import { stacksOf } from '../../../tests/stackFixtures.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { TicketFacts } from '../../data/snapshot.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const repository = repositoryOf(null, '/code/koja/.git');

const context = { notify: () => undefined, stop_propagation: () => undefined };

const ticketFacts = (id: string): TicketFacts => ({
  id,
  title: `The ${id} title`,
  state: 'In Progress',
  url: `https://linear.app/koja/issue/${id}`,
  parent: null,
});

const useLinkedSpaces = (): void => {
  anotherOwner();

  const facts = storedFacts(
    [
      {
        folder: '/code/koja',
        commonDirectory: '/code/koja/.git',
        linked: false,
        branch: 'me-4-header',
      },
      {
        folder: '/code/koja-top',
        commonDirectory: '/code/koja/.git',
        linked: true,
        branch: 'me-3-top',
      },
    ],
    {
      [repository.key]: {
        pulls: [
          pullFacts({ number: 503, headRefName: 'me-1-low' }),
          pullFacts({ number: 504, headRefName: 'me-2-mid', state: 'MERGED' }),
          pullFacts({ number: 506, headRefName: 'me-4-header' }),
          readyPull({ number: 505, headRefName: 'me-3-top' }),
        ],
        failed: false,
      },
    },
  );

  facts.trackers = {
    [repository.key]: {
      workspace: 'koja',
      tickets: { 'ME-3': ticketFacts('ME-3'), 'ME-4': ticketFacts('ME-4') },
      failed: false,
    },
  };

  facts.stacks = stacksOf(repository, ['me-1-low', 'me-2-mid', 'me-3-top']);

  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-top')];
};

const rightPress = (view: FakeView, id: string): void => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  row.mouseHandlers['on_mouse_down:right']?.[0]?.({}, context);
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
    useLinkedSpaces();

    const view = await loadView();

    rightPress(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });

  test('right-clicking a project header opens the menu with its main space links', async () => {
    useLinkedSpaces();

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
    useLinkedSpaces();
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    rightPress(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });
});
