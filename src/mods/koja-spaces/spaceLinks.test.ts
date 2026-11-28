import { afterAll, describe, expect, test } from 'bun:test';

import { click, clickablesWithText } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { restoreKojaSpaces, setupKojaSpaces } from '../../../tests/kojaSpacesView.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import type { DataState } from '../../data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import { emptyFacts, snapshotVersion } from '../../data/snapshot.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { ListModel, RowModel } from './listModel.ts';
import { spaceLinksOf } from './spaceLinks.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

await setupKojaSpaces();

const { selectedFooter } = (await import('./selectedFooter.ts')) as unknown as {
  selectedFooter: (
    state: DataState,
    model: ListModel,
    activeId: string | null,
  ) => DrawnElement | null;
};

afterAll(() => {
  restoreKojaSpaces();
});

const repository = repositoryOf(null, '/code/koja/.git');

const liveState: DataState = {
  kind: 'live',
  snapshot: { version: snapshotVersion, revision: 1, facts: emptyFacts() },
  owner: 'window-a',
  generation: 1,
  heartbeatAt: 0,
  staleAt: 30_000,
};

const listedSpace = (folder: string, branch: string | null): ListedSpace => {
  const git: GitInfo = {
    branch,
    worktreeKey: worktreeOf(null, folder).key,
    repo: repository,
    root: folder,
    linked: true,
  };

  const space = {
    id: 'w',
    index: 1,
    name: 'name-w',
    named: true,
    folder,
    machine: null,
    branch: null,
    active: false,
    status: null,
    tabs: [],
  };

  return { space, git, status: null, place: placeOf(null, folder) };
};

const rowModelOf = (pull: Pull | null, stack: SpaceStack | null): RowModel => ({
  row: listedSpace('/code/me-11-eleven', 'me-11-eleven'),
  project: 'koja',
  title: 'name-w',
  pull,
  ticket: null,
  ticketTitle: null,
  need: null,
  stack,
});

const modelOf = (rows: RowModel[]): ListModel => ({
  view: 'projects',
  projects: [],
  rows: new Map(rows.map((row) => [row.row.space.id, row])),
  ids: rows.map((row) => row.row.space.id),
});

const checkedOutStack = (number: number, url: string): SpaceStack => ({
  pulls: [
    {
      branch: 'me-11-eleven',
      ticket: 'ME-11',
      number,
      url,
      title: 'The checked-out pull',
      state: 'open',
      checkedOut: true,
      restack: 'none',
      need: null,
    },
  ],
  merged: 0,
  total: 1,
});

describe('spaceLinksOf', () => {
  test('a space with no git has no branch and no pull', () => {
    const model: RowModel = {
      ...rowModelOf(null, null),
      row: { ...listedSpace('/code/me-11-eleven', 'me-11-eleven'), git: null },
    };

    expect(spaceLinksOf(model)).toEqual({ ticket: null, pull: null, branch: null });
  });

  test('the footer and the menu name the same pull', () => {
    const stackPull = { number: 11, url: 'https://example.invalid/koja/pull/11' };

    const branchPull = pullFacts({
      number: 99,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/99',
    });

    const model = rowModelOf(branchPull, checkedOutStack(stackPull.number, stackPull.url));
    const footer = selectedFooter(liveState, modelOf([model]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    const [link] = clickablesWithText(footer, `#${stackPull.number}`);

    if (link === undefined) {
      throw new Error('The footer draws no pull link.');
    }

    const opened: string[] = [];

    click(link, {
      open_url: (url: string) => {
        opened.push(url);
      },
    });

    expect(spaceLinksOf(model).pull).toEqual(stackPull);
    expect(opened).toEqual([stackPull.url]);
  });
});
