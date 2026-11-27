import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawnTexts } from '../../../tests/drawn.ts';
import { restoreKojaSpaces, setupKojaSpaces } from '../../../tests/kojaSpacesView.ts';
import { kitIndexFake } from '../../../tests/moduleFakes.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import type { DataState } from '../../data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import type { TicketFacts } from '../../data/snapshot.ts';
import { emptyFacts, snapshotVersion } from '../../data/snapshot.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import type { ListModel, RowModel } from './listModel.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

await setupKojaSpaces();

const { linkText } = (await import('../../kit/text.ts')) as unknown as {
  linkText: (text: string) => DrawnElement;
};

const { spaceFooter } = (await import('../../kit/spaceFooter.ts')) as unknown as {
  spaceFooter: (options: { title: string; links: DrawnElement[] }) => DrawnElement;
};

await mock.module('../../kit/index.ts', () => ({ ...kitIndexFake(), linkText, spaceFooter }));

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

const listedSpace = (id: string, linked: boolean): ListedSpace => {
  const folder = `/code/${id}`;

  const git: GitInfo = {
    branch: 'main',
    worktreeKey: worktreeOf(null, folder).key,
    repo: repository,
    root: folder,
    linked,
  };

  const space = {
    id,
    index: 1,
    name: `name-${id}`,
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

const rowModel = (options: {
  id: string;
  pull?: Pull | null;
  ticket?: TicketFacts | null;
  stack?: SpaceStack | null;
  linked?: boolean;
  project?: string;
}): RowModel => ({
  row: listedSpace(options.id, options.linked ?? true),
  project: options.project ?? 'koja',
  pull: options.pull ?? null,
  ticket: options.ticket ?? null,
  ticketTitle: options.ticket?.title ?? null,
  need: null,
  stack: options.stack ?? null,
});

const modelOf = (rows: RowModel[]): ListModel => ({
  view: 'projects',
  projects: [],
  rows: new Map(rows.map((row) => [row.row.space.id, row])),
  ids: rows.map((row) => row.row.space.id),
});

describe('selectedFooter', () => {
  test("clicking the footer's PR link opens the pull's URL", () => {
    const pull = pullFacts({
      number: 505,
      headRefName: 'me-505-top',
      url: 'https://example.invalid/koja/pull/505',
    });

    const footer = selectedFooter(liveState, modelOf([rowModel({ id: 'w', pull })]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    const [link] = clickablesWithText(footer, '#505');

    if (link === undefined) {
      throw new Error('The footer draws no pull link.');
    }

    const opened: string[] = [];

    click(link, { open_url: (url: string) => opened.push(url) });

    expect(opened).toEqual(['https://example.invalid/koja/pull/505']);
  });

  test("clicking the footer's ticket link opens the ticket's URL", () => {
    const ticket: TicketFacts = {
      id: 'ME-1180',
      title: 'The ticket title',
      state: 'In Progress',
      url: 'https://linear.app/sqve/issue/ME-1180',
      parent: null,
    };

    const footer = selectedFooter(liveState, modelOf([rowModel({ id: 'w', ticket })]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    const [link] = clickablesWithText(footer, 'ME-1180');

    if (link === undefined) {
      throw new Error('The footer draws no ticket link.');
    }

    const opened: string[] = [];

    click(link, { open_url: (url: string) => opened.push(url) });

    expect(opened).toEqual(['https://linear.app/sqve/issue/ME-1180']);
  });

  test("a selected stack space's footer shows merged over total merged", () => {
    const stack: SpaceStack = { pulls: [], merged: 1, total: 3 };

    const footer = selectedFooter(liveState, modelOf([rowModel({ id: 'w', stack })]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    expect(drawnTexts(footer)).toContain('1/3 merged');
  });

  test('a selected space outside any stack shows its title without a bar', () => {
    const footer = selectedFooter(liveState, modelOf([rowModel({ id: 'w' })]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    const counts = drawnTexts(footer).filter((text) => /^\d+\/\d+ merged$/.test(text));

    expect(drawnTexts(footer)).toContain('name-w');
    expect(counts).toEqual([]);
  });

  test('no active space, or no data, gives no footer', () => {
    const model = modelOf([rowModel({ id: 'w' })]);

    expect(selectedFooter(liveState, model, null)).toBeNull();
    expect(selectedFooter({ kind: 'unavailable' }, model, 'w')).toBeNull();
  });

  test('a selected project main space shows the project name', () => {
    const footer = selectedFooter(
      liveState,
      modelOf([rowModel({ id: 'w', linked: false, project: 'koja' })]),
      'w',
    );

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    const texts = drawnTexts(footer);

    expect(texts).toContain('koja');
    expect(texts).not.toContain('name-w');
  });
});
