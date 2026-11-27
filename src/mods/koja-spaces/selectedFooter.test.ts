import { afterAll, describe, expect, test } from 'bun:test';

import { click, clickablesWithText, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { restoreKojaSpaces, setupKojaSpaces } from '../../../tests/kojaSpacesView.ts';
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

const stateWithPulls = (pulls: Pull[]): DataState => ({
  ...liveState,
  snapshot: {
    version: snapshotVersion,
    revision: 1,
    facts: {
      ...emptyFacts(),
      pulls: { [repository.key]: { pulls, failed: false } },
    },
  },
});

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
  title?: string;
  pull?: Pull | null;
  ticket?: TicketFacts | null;
  stack?: SpaceStack | null;
  linked?: boolean;
  project?: string;
}): RowModel => ({
  row: listedSpace(options.id, options.linked ?? true),
  project: options.project ?? 'koja',
  title: options.title ?? `name-${options.id}`,
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

const checkedOutStack = (number: number | null, url: string | null): SpaceStack => ({
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

const openedBy = (footer: DrawnElement, text: string): string[] => {
  const [link] = clickablesWithText(footer, text);

  if (link === undefined) {
    throw new Error(`The footer draws no ${text} link.`);
  }

  const opened: string[] = [];

  click(link, { open_url: (url: string) => opened.push(url) });

  return opened;
};

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

    expect(openedBy(footer, '#505')).toEqual(['https://example.invalid/koja/pull/505']);
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

    expect(openedBy(footer, 'ME-1180')).toEqual(['https://linear.app/sqve/issue/ME-1180']);
  });

  test("a stack footer links the PR its card shows, not the branch's other pull", () => {
    const cardPull = pullFacts({
      number: 11,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/11',
    });

    const branchPull = pullFacts({
      number: 99,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/99',
    });

    const footer = selectedFooter(
      stateWithPulls([cardPull, branchPull]),
      modelOf([rowModel({ id: 'w', pull: branchPull, stack: checkedOutStack(11, cardPull.url) })]),
      'w',
    );

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    expect(openedBy(footer, '#11')).toEqual(['https://example.invalid/koja/pull/11']);
    expect(clickablesWithText(footer, '#99')).toEqual([]);
  });

  test('a stack footer links the pull the stack resolved when two pulls share its number', () => {
    const cardPull = pullFacts({
      number: 11,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/11',
    });

    const otherPull = pullFacts({
      number: 11,
      headRefName: 'me-11-fork',
      url: 'https://example.invalid/koja/fork/pull/11',
    });

    const footer = selectedFooter(
      stateWithPulls([otherPull, cardPull]),
      modelOf([rowModel({ id: 'w', pull: cardPull, stack: checkedOutStack(11, cardPull.url) })]),
      'w',
    );

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    expect(openedBy(footer, '#11')).toEqual(['https://example.invalid/koja/pull/11']);
  });

  test('a stack footer draws no PR link when its checked-out PR is not in the snapshot', () => {
    const branchPull = pullFacts({
      number: 99,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/99',
    });

    const footer = selectedFooter(
      stateWithPulls([branchPull]),
      modelOf([rowModel({ id: 'w', pull: branchPull, stack: checkedOutStack(11, null) })]),
      'w',
    );

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    expect(clickablesWithText(footer, '#11')).toEqual([]);
    expect(clickablesWithText(footer, '#99')).toEqual([]);
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

    expect(drawnTexts(footer)).toEqual(['name-w']);
  });

  test('an active space with no row model draws no footer', () => {
    expect(selectedFooter(liveState, modelOf([rowModel({ id: 'w' })]), 'missing')).toBeNull();
  });

  test('no active space, or no data, gives no footer', () => {
    const model = modelOf([rowModel({ id: 'w' })]);

    expect(selectedFooter(liveState, model, null)).toBeNull();
    expect(selectedFooter({ kind: 'unavailable' }, model, 'w')).toBeNull();
  });

  test('a selected project main space shows the project name', () => {
    const footer = selectedFooter(
      liveState,
      modelOf([rowModel({ id: 'w', linked: false, project: 'koja', title: 'koja' })]),
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
