import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { drawnTexts, elementsWithId, elementsWithStyle } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
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
import { overlaySize } from '../../kit/size.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const context = { notify: () => undefined, stop_propagation: () => undefined };

const repository = repositoryOf(null, '/code/koja/.git');

const stackBranches = ['me-1-low', 'me-2-mid', 'me-3-top'];

const stackCheckouts = [
  { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
  {
    folder: '/code/koja-top',
    commonDirectory: '/code/koja/.git',
    linked: true,
    branch: 'me-3-top',
  },
];

const stackPulls = () => [
  pullFacts({
    number: 503,
    headRefName: 'me-1-low',
    checks: { kind: 'read', value: 'failing' },
  }),
  pullFacts({ number: 504, headRefName: 'me-2-mid', state: 'MERGED' }),
  readyPull({ number: 505, headRefName: 'me-3-top' }),
];

const useSpaces = (withStack: boolean): void => {
  const pulls = withStack ? stackPulls() : [];

  const facts = storedFacts(stackCheckouts, {
    [repository.key]: { pulls, failed: false },
  });

  if (withStack) {
    facts.stacks = stacksOf(repository, stackBranches);
  }

  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-top')];
};

const cardOf = (view: FakeView, id: string): DrawnElement | null => {
  const wrappers = elementsWithStyle(view.render(), 'content');

  const wrapper = wrappers.find((element) => elementsWithId(element, `space-${id}`).length > 0);
  const card = wrapper?.styles['content']?.[0];

  return card === undefined ? null : (card as DrawnElement);
};

const rowOf = (view: FakeView, id: string): DrawnElement => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  return row;
};

describe('koja-spaces stack card', () => {
  test("a stack space's row opens a card listing its pulls", async () => {
    anotherOwner();
    useSpaces(true);

    const view = await loadView();
    const card = cardOf(view, 'w');

    if (card === null) {
      throw new Error('The stack row draws no card.');
    }

    const texts = drawnTexts(card);

    expect(texts).toContain('#503');
    expect(texts).toContain('#504');
    expect(texts).toContain('#505');
  });

  test("a stack space's row wraps its card with the space's id and a left anchor", async () => {
    anotherOwner();
    useSpaces(true);

    const view = await loadView();

    const wrapper = elementsWithStyle(view.render(), 'content').find(
      (element) => elementsWithId(element, 'space-w').length > 0,
    );

    expect(wrapper?.styles['hoverCardId']?.[0]).toBe('stack-card-w');
    expect(wrapper?.styles['anchor']?.[0]).toBe('left_center');
  });

  test('a space without a stack gets no card', async () => {
    anotherOwner();
    useSpaces(false);

    const view = await loadView();

    expect(cardOf(view, 'w')).toBeNull();
  });

  test('an Inbox row with a stack opens a card listing its pulls', async () => {
    anotherOwner();
    useSpaces(true);
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();
    const card = cardOf(view, 'w');

    if (card === null) {
      throw new Error('The stack row draws no card.');
    }

    const texts = drawnTexts(card);

    expect(texts).toContain('#503');
    expect(texts).toContain('#504');
    expect(texts).toContain('#505');
  });
});

describe('koja-spaces row interaction', () => {
  test('a right click on a row opens its space menu', async () => {
    useSpaces(true);
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    rowOf(view, 'w').mouseHandlers['on_mouse_down:right']?.[0]?.({}, context);

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({
        mod: 'koja-menu',
        kind: 'popup',
        width: overlaySize.menuWidth,
        height: overlaySize.menuHeight,
        props: { tab: 'space', target: { id: 'w' } },
      }),
    ]);
  });
});
