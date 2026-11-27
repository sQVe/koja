import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { elementWithIcon, elementsWithId } from '../../../tests/drawn.ts';
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

const rowEndOf = (view: FakeView, id: string): DrawnElement => {
  const [row] = elementsWithId(view.render(), id);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  const rowEnd = row.kids.at(-1);

  if (rowEnd === undefined) {
    throw new Error(`The drawn row ${id} has no trailing slot`);
  }

  return rowEnd;
};

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

const useSingleStack = (failed: boolean, restack: 'needed' | 'none'): void => {
  const facts = storedFacts(checkouts, {
    [kojaRepository.key]: { pulls: [readyPull], failed },
  });

  facts.stacks = stacksOf(kojaRepository, ['me-2-top'], restack);
  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-fix')];
};

describe('koja-spaces row work need', () => {
  test('a stack with a failing PR and a mergeable PR ends the row with the CI failing icon', async () => {
    anotherOwner();
    useStackFacts();

    const view = await loadView();
    const rowEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(rowEnd, 'circle-x.svg')).not.toBeNull();
    expect(elementWithIcon(rowEnd, 'git-merge.svg')).toBeNull();
  });

  test('a failed PR read keeps the last need on the row', async () => {
    anotherOwner();
    useStackFacts();

    const view = await loadView();
    const beforeEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(beforeEnd, 'circle-x.svg')).not.toBeNull();

    useStackFacts(true);

    const afterEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(afterEnd, 'circle-x.svg')).not.toBeNull();
  });

  test('a failed PR read drops the kept need when another repository takes the same path', async () => {
    anotherOwner();
    useStackFacts();

    const view = await loadView();
    const beforeEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(beforeEnd, 'circle-x.svg')).not.toBeNull();

    const otherRepository = repositoryOf(null, '/code/other/.git');

    const replaced = storedFacts(
      [
        { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
        {
          folder: '/code/koja-fix',
          commonDirectory: '/code/other/.git',
          linked: true,
          branch: 'me-2-top',
        },
      ],
      { [otherRepository.key]: { pulls: [], failed: true } },
    );

    showFacts(replaced);

    const afterEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(afterEnd, 'circle-x.svg')).toBeNull();
  });

  test('a failed PR read keeps the last need when the stack facts change', async () => {
    anotherOwner();
    useSingleStack(false, 'needed');

    const view = await loadView();
    const beforeEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(beforeEnd, 'layers.svg')).not.toBeNull();

    useSingleStack(true, 'none');

    const afterEnd = rowEndOf(view, 'space-w');

    expect(elementWithIcon(afterEnd, 'layers.svg')).not.toBeNull();
    expect(elementWithIcon(afterEnd, 'git-merge.svg')).toBeNull();
  });
});
