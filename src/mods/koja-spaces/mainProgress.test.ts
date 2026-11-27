import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { descendants, drawnTexts, elementsWithId } from '../../../tests/drawn.ts';
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
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

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

const rowOf = (view: FakeView, id: string): DrawnElement => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  return row;
};

const positionOfText = (row: DrawnElement, text: string): number =>
  descendants(row).findIndex((part) => part.texts.includes(text));

const positionOfIcon = (row: DrawnElement, name: string): number =>
  descendants(row).findIndex((part) => part.path?.endsWith(name) === true);

describe('koja-spaces row progress', () => {
  test("a stack space's row shows merged over total before its work icon", async () => {
    anotherOwner();
    useSpaces(true);

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
    useSpaces(false);

    const view = await loadView();
    const counts = drawnTexts(rowOf(view, 'w')).filter((text) => /^\d+\/\d+$/.test(text));

    expect(counts).toEqual([]);
  });

  test('the Inbox row shows the same count', async () => {
    anotherOwner();
    useSpaces(true);
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    expect(drawnTexts(rowOf(view, 'w'))).toContain('1/3');
  });
});
