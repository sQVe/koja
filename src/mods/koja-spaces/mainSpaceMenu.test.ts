import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { rightPress } from '../../../tests/drawn.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
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
import { rowOf, topCheckout, trunkCheckout } from '../../../tests/stackViewFixtures.ts';
import type { RepositoryIdentity } from '../../data/gitIdentity.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import type { RepositoryStacks, TicketFacts } from '../../data/snapshot.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const linkCheckouts = [{ ...trunkCheckout, branch: 'me-4-header' }, topCheckout];

const repository = repositoryOf(null, '/code/koja/.git');

const stackBranches = ['me-1-low', 'me-2-mid', 'me-3-top'];

// The top branch's own pull (999) is not the pull its stack records (505), so a fallback to the
// branch pull shows up as the wrong number. The recorded pull's head ref is a fork branch, so only
// the number the stack records reaches it.
const linkPulls = (): Pull[] => [
  pullFacts({ number: 503, headRefName: 'me-1-low', checks: { kind: 'read', value: 'failing' } }),
  pullFacts({ number: 504, headRefName: 'me-2-mid', state: 'MERGED' }),
  pullFacts({ number: 506, headRefName: 'me-4-header' }),
  readyPull({ number: 999, headRefName: 'me-3-top' }),
  readyPull({ number: 505, headRefName: 'me-3-top-fork' }),
];

const linkStack = (owner: RepositoryIdentity): Record<string, RepositoryStacks> =>
  stacksOf(owner, stackBranches, 'none', { 'me-1-low': 503, 'me-2-mid': 504, 'me-3-top': 505 });

const linkTicket = (id: string): TicketFacts => ({
  id,
  title: `The ${id} title`,
  state: 'In Progress',
  url: `https://linear.app/koja/issue/${id}`,
  parent: null,
});

// Two spaces with a ticket, a pull, and a branch each, so a space menu can be opened on a row and
// on a project header.
const useStackLinks = (): void => {
  const facts = storedFacts(linkCheckouts, {
    [repository.key]: { pulls: linkPulls(), failed: false },
  });

  facts.trackers = {
    [repository.key]: {
      workspace: 'koja',
      tickets: { 'ME-3': linkTicket('ME-3'), 'ME-4': linkTicket('ME-4') },
      failed: false,
    },
  };

  facts.stacks = linkStack(repository);

  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-top')];
};

const context = { notify: () => undefined, stop_propagation: () => undefined };

const pressRow = (view: FakeView, id: string): void => {
  rightPress(rowOf(view, id), context);
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

    pressRow(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });

  test('right-clicking a project header opens the menu with its main space links', async () => {
    useStackLinks();

    const view = await loadView();

    pressRow(view, 'm');

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

    pressRow(view, 'w');

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({ mod: 'koja-menu', props: rowLinks }),
    ]);
  });
});
