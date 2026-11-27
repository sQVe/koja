import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { elementWithIcon, elementsWithId } from '../../../tests/drawn.ts';
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
import { pullFacts } from '../../../tests/pullFacts.ts';
import { stacksOf } from '../../../tests/stackFixtures.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const kojaRepository = repositoryOf(null, '/code/koja/.git');

const checkouts = [
  { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
  {
    folder: '/code/koja-fix',
    commonDirectory: '/code/koja/.git',
    linked: true,
    branch: 'me-2-top',
  },
];

const failingPull = pullFacts({
  number: 701,
  headRefName: 'me-1-lower',
  checks: { kind: 'read', value: 'failing' },
});

const readyPull = pullFacts({
  number: 702,
  headRefName: 'me-2-top',
  mergeable: 'mergeable',
  mergeState: 'clean',
  review: 'approved',
  checks: { kind: 'read', value: 'passing' },
  threads: { kind: 'read', value: { unresolved: 0, complete: true } },
});

const useStackFacts = (failed = false): void => {
  const facts = storedFacts(checkouts, {
    [kojaRepository.key]: { pulls: [failingPull, readyPull], failed },
  });

  facts.stacks = stacksOf(kojaRepository, ['me-1-lower', 'me-2-top']);
  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-fix')];
};

describe('koja-spaces row work need', () => {
  test('a stack with a failing PR and a mergeable PR ends the row with the CI failing icon', async () => {
    anotherOwner();
    useStackFacts();

    const view = await loadView();
    const [row] = elementsWithId(view.render(), 'space-w');

    expect(row).toBeDefined();

    const rowEnd = (row as DrawnElement).kids.at(-1);

    expect(rowEnd).toBeDefined();
    expect(elementWithIcon(rowEnd as DrawnElement, 'circle-x.svg')).not.toBeNull();
    expect(elementWithIcon(row as DrawnElement, 'git-merge.svg')).toBeNull();
  });

  test('a failed PR read keeps the last need on the row', async () => {
    anotherOwner();
    useStackFacts(true);

    const view = await loadView();
    const [row] = elementsWithId(view.render(), 'space-w');
    const rowEnd = (row as DrawnElement).kids.at(-1);

    expect(elementWithIcon(rowEnd as DrawnElement, 'circle-x.svg')).not.toBeNull();
  });
});
