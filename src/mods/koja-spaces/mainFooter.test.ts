import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawnTexts } from '../../../tests/drawn.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
  anotherOwner,
  kitParts,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  showFacts,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { realKitIndexFake } from '../../../tests/moduleFakes.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';

await setupKojaSpaces();

const kitFake = await realKitIndexFake([...kitParts, 'spaceFooter']);

await mock.module('../../kit/index.ts', () => kitFake);

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const repository = repositoryOf(null, '/code/notes/.git');

const listIndexOf = (root: DrawnElement): number => {
  const index = root.kids.findIndex((kid) => kid.styles['id']?.[0] === 'spaces-list');

  if (index === -1) {
    throw new Error('The sidebar draws no list.');
  }

  return index;
};

const rootOf = (view: FakeView): DrawnElement => view.render();

const usePullOnActiveSpace = (): void => {
  anotherOwner();

  showFacts(
    storedFacts(
      [
        {
          folder: '/code/notes',
          commonDirectory: '/code/notes/.git',
          linked: false,
          branch: 'me-1-one',
        },
      ],
      {
        [repository.key]: {
          pulls: [pullFacts({ number: 12, headRefName: 'me-1-one' })],
          failed: false,
        },
      },
    ),
  );
};

describe('koja-spaces selected footer', () => {
  test("the selected space's footer is drawn under the list", async () => {
    usePullOnActiveSpace();

    const view = await loadView();
    const root = rootOf(view);
    const listIndex = listIndexOf(root);
    const footer = root.kids[listIndex + 1];

    if (footer === undefined) {
      throw new Error('No footer child follows the list.');
    }

    expect(drawnTexts(footer)).toContain('#12');
    expect(root.kids).toHaveLength(listIndex + 2);
  });

  test('no selected space draws no footer child', async () => {
    for (const shown of state.spaceList) {
      shown.active = false;
    }

    const view = await loadView();
    const root = rootOf(view);
    const listIndex = listIndexOf(root);

    expect(root.kids).toHaveLength(listIndex + 1);
  });
});
