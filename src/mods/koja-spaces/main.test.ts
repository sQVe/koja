import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { drawnTexts } from '../../../tests/drawn.ts';
import {
  anotherOwner,
  listChildren,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  showFacts,
  space,
  spaceNames,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { stacksOf } from '../../../tests/stackFixtures.ts';
import { readDataState } from '../../data/consumer.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { Facts } from '../../data/snapshot.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

describe('koja-spaces data host', () => {
  test('a started sidebar publishes a live data snapshot', async () => {
    await loadView();

    const snapshot = readDataState((key) => state.sharedValues[key], Date.now());

    expect(snapshot.kind).toBe('live');
  });
});

describe('koja-spaces stored git facts', () => {
  test('groups spaces by the stored git facts', async () => {
    showFacts(
      storedFacts([
        { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
        { folder: '/code/koja-fix', commonDirectory: '/code/koja/.git', linked: true },
        {
          folder: '/srv/app',
          machine: 'build-box',
          commonDirectory: '/srv/app/.git',
          linked: false,
        },
      ]),
    );

    state.spaceList = [
      space('w', true, '/code/koja-fix'),
      space('m', false, '/code/koja'),
      space('r', false, '/srv/app', 'build-box'),
    ];

    const view = await loadView();
    const texts = listChildren(view).flatMap(drawnTexts);

    expect(spaceNames(view)).toEqual(['name-w']);
    expect(texts.filter((text) => text === 'koja')).toHaveLength(1);
    expect(texts.filter((text) => text === 'app')).toHaveLength(1);
    expect(texts.filter((text) => text === 'build-box')).toHaveLength(1);
  });
});

const kojaRepository = repositoryOf(null, '/code/koja/.git');
const kojaRepositoryKey = kojaRepository.key;

const ticketFacts = (id: string, title: string, parent: string | null = null) => ({
  id,
  title,
  state: 'Todo',
  url: `https://linear.app/koja/issue/${id}`,
  parent,
});

const checkouts = [
  { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
  {
    folder: '/code/me-666-login',
    commonDirectory: '/code/koja/.git',
    linked: true,
    branch: 'me-666-login',
  },
];

const showWorktreeFacts = (facts: Facts, named = false): void => {
  showFacts(facts);

  state.spaceList = [
    space('m', true, '/code/koja'),
    { ...space('w', false, '/code/me-666-login'), named },
  ];
};

const useTicketFacts = (): void => {
  const facts = storedFacts(checkouts);

  facts.trackers = {
    [kojaRepositoryKey]: {
      workspace: 'koja',
      tickets: { 'ME-666': ticketFacts('ME-666', 'Log in with a ticket') },
      failed: false,
    },
  };

  showWorktreeFacts(facts);
};

const useStackFacts = (
  parent: string,
  secondParent: string,
  parentTitle = 'The shared parent',
  named = false,
): void => {
  const facts = storedFacts(checkouts);

  facts.trackers = {
    [kojaRepositoryKey]: {
      workspace: 'koja',
      tickets: {
        'ME-666': ticketFacts('ME-666', 'Log in with a ticket', parent),
        'ME-667': ticketFacts('ME-667', 'Log out again', secondParent),
        'ME-100': ticketFacts('ME-100', parentTitle),
        'ME-101': ticketFacts('ME-101', 'Another parent'),
      },
      failed: false,
    },
  };

  facts.stacks = stacksOf(kojaRepository, ['me-666-login', 'me-667-logout']);

  showWorktreeFacts(facts, named);
};

describe('koja-spaces stack title', () => {
  test('titles a stack row with the parent its tickets share', async () => {
    anotherOwner();
    useStackFacts('ME-100', 'ME-100');

    const view = await loadView();

    expect(drawnTexts(view.render())).toContain('The shared parent');
  });

  test('titles a stack row with its own ticket when the parent has no title', async () => {
    anotherOwner();
    useStackFacts('ME-100', 'ME-100', '');

    const view = await loadView();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('Log in with a ticket');
  });

  test('a named space keeps its name over the stack title', async () => {
    anotherOwner();
    useStackFacts('ME-100', 'ME-100', 'The shared parent', true);

    const view = await loadView();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('name-w');
    expect(texts).not.toContain('The shared parent');
  });

  test('titles a stack row with its own ticket when the parents differ', async () => {
    anotherOwner();
    useStackFacts('ME-100', 'ME-101');

    const view = await loadView();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('Log in with a ticket');
    expect(texts).not.toContain('The shared parent');
  });
});

describe('koja-spaces ticket facts', () => {
  test('titles an unnamed row with the ticket of its branch from the snapshot', async () => {
    anotherOwner();
    useTicketFacts();

    const view = await loadView();

    expect(drawnTexts(view.render())).toContain('Log in with a ticket');
  });
});
