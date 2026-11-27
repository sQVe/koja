import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { click, clickablesWithText, drawnTexts, elementsWithId } from '../../../tests/drawn.ts';
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
import { pullFacts } from '../../../tests/pullFacts.ts';
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

const repository = repositoryOf(null, '/code/notes/.git');

const listIndexOf = (root: DrawnElement): number => {
  const index = root.kids.findIndex((kid) => kid.styles['id']?.[0] === 'spaces-list');

  if (index === -1) {
    throw new Error('The sidebar draws no list.');
  }

  return index;
};

const rootOf = (view: FakeView): DrawnElement => view.render();

const footerOf = (view: FakeView): DrawnElement => {
  const root = rootOf(view);
  const listIndex = listIndexOf(root);
  const footer = root.kids[listIndex + 1];

  if (footer === undefined) {
    throw new Error('No footer child follows the list.');
  }

  return footer;
};

const rowTitleOf = (view: FakeView, id: string): string => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  const [title] = drawnTexts(row);

  if (title === undefined) {
    throw new Error(`The row for ${id} draws no title.`);
  }

  return title;
};

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

const useTwoUnlinkedCheckouts = (): void => {
  anotherOwner();

  showFacts(
    storedFacts([
      { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false, branch: 'main' },
      {
        folder: '/code/koja-copy',
        commonDirectory: '/code/koja/.git',
        linked: false,
        branch: 'copy',
      },
    ]),
  );
};

const useLinkedCheckout = (): void => {
  anotherOwner();

  showFacts(
    storedFacts([
      { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
      {
        folder: '/code/koja-fix',
        commonDirectory: '/code/koja/.git',
        linked: true,
        branch: 'fix',
      },
    ]),
  );

  state.spaceList = [space('m', false, '/code/koja'), space('w', true, '/code/koja-fix')];
};

const ticketFacts = (id: string, title: string, parent: string | null = null): TicketFacts => ({
  id,
  title,
  state: 'In Progress',
  url: `https://linear.app/koja/issue/${id}`,
  parent,
});

const useStackTickets = (): void => {
  anotherOwner();

  const kojaRepository = repositoryOf(null, '/code/koja/.git');

  const facts = storedFacts([
    { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false, branch: 'main' },
    {
      folder: '/code/me-666-login',
      commonDirectory: '/code/koja/.git',
      linked: true,
      branch: 'me-666-login',
    },
    {
      folder: '/code/me-667-logout',
      commonDirectory: '/code/koja/.git',
      linked: true,
      branch: 'me-667-logout',
    },
  ]);

  facts.trackers = {
    [kojaRepository.key]: {
      workspace: 'koja',
      tickets: {
        'ME-666': ticketFacts('ME-666', 'Log in with a ticket', 'ME-100'),
        'ME-667': ticketFacts('ME-667', 'Log out again', 'ME-100'),
        'ME-100': ticketFacts('ME-100', 'The shared parent'),
      },
      failed: false,
    },
  };

  facts.stacks = stacksOf(kojaRepository, ['me-666-login', 'me-667-logout']);

  showFacts(facts);

  state.spaceList = [
    space('m', false, '/code/koja'),
    { ...space('w', true, '/code/me-666-login'), named: false },
  ];
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

  test("a second unlinked checkout's footer is titled as its row", async () => {
    useTwoUnlinkedCheckouts();
    state.spaceList = [space('m', false, '/code/koja'), space('x', true, '/code/koja-copy')];

    const view = await loadView();

    expect(drawnTexts(footerOf(view))[0]).toBe(rowTitleOf(view, 'x'));
    expect(rowTitleOf(view, 'x')).toBe('name-x');
  });

  test("a linked row's footer is titled as its row under another header", async () => {
    useLinkedCheckout();

    const view = await loadView();

    expect(drawnTexts(footerOf(view))[0]).toBe(rowTitleOf(view, 'w'));
    expect(rowTitleOf(view, 'w')).toBe('name-w');
  });

  test("an Inbox footer is titled as its row, even for a project's header space", async () => {
    useTwoUnlinkedCheckouts();
    state.spaceList = [space('m', true, '/code/koja'), space('x', false, '/code/koja-copy')];
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    expect(drawnTexts(footerOf(view))[0]).toBe(rowTitleOf(view, 'm'));
    expect(rowTitleOf(view, 'm')).toBe('name-m');
  });

  test.each(['projects', 'inbox'] as const)(
    'the footer ticket link from the snapshot opens the stored URL in %s',
    async (shown) => {
      useStackTickets();

      if (shown === 'inbox') {
        state.store.set(sidebarViewKey, 'inbox');
      }

      const view = await loadView();
      const footer = footerOf(view);

      expect(drawnTexts(footer)).toContain('The shared parent');

      const [link] = clickablesWithText(footer, 'ME-666');

      if (link === undefined) {
        throw new Error('The footer draws no ticket link.');
      }

      const opened: string[] = [];

      click(link, { open_url: (url: string) => opened.push(url) });

      expect(opened).toEqual(['https://linear.app/koja/issue/ME-666']);
    },
  );
});
