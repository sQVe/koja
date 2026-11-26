import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../tests/pullFacts.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { ticketIdOf } from './linearTickets.ts';
import type { Pull } from './pulls.ts';
import type { Facts, TicketFacts } from './snapshot.ts';
import { spaceStackOf, stackTitleOf } from './spaceStack.ts';
import type { StackBranch } from './stacks.ts';

interface Fixture {
  stack: string[];
  branch: string;
  pulls?: Pull[];
  pullNumbers?: Record<string, number | null>;
  restacks?: Record<string, StackBranch['restack']>;
  parents?: Record<string, string>;
  readParent?: boolean;
}

const folder = '/code/me-1-one';
const repository = repositoryOf(null, `${folder}/.git`);
const worktree = worktreeOf(null, folder);

const ticketFacts = (id: string, parent: string | null): TicketFacts => ({
  id,
  title: `Title of ${id}`,
  state: 'In Progress',
  url: `https://linear.app/sqve/issue/${id}`,
  parent,
});

const factsOf = (fixture: Fixture): Facts => {
  const place = placeOf(null, folder);
  const tickets: Record<string, TicketFacts> = {};

  for (const branch of fixture.stack) {
    const id = ticketIdOf(branch, '');

    if (id !== null) {
      tickets[id] = ticketFacts(id, fixture.parents?.[id] ?? null);
    }
  }

  if (fixture.readParent !== false) {
    for (const parent of Object.values(fixture.parents ?? {})) {
      tickets[parent] = ticketFacts(parent, null);
    }
  }

  const branches = fixture.stack.map((branch): StackBranch => ({
    branch,
    pullNumber: fixture.pullNumbers?.[branch] ?? null,
    restack: fixture.restacks?.[branch] ?? 'none',
  }));

  return {
    git: {
      places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
      worktrees: {
        [worktree.key]: {
          repository,
          root: folder,
          branch: fixture.branch,
          linked: false,
          bare: false,
        },
      },
    },
    pulls: { [repository.key]: { pulls: fixture.pulls ?? [], failed: false } },
    trackers: {
      [repository.key]: {
        workspace: 'sqve',
        tickets,
        failed: false,
      },
    },
    stacks: {
      [repository.key]: {
        stacks: [{ trunk: 'main', branches }],
        failed: false,
      },
    },
  };
};

const pullOf = (branch: string, number: number, state: string, isDraft = false): Pull =>
  pullFacts({ number, headRefName: branch, title: `Title of ${number}`, state, isDraft });

describe('spaceStackOf', () => {
  test("a space's stack counts merged PRs", () => {
    const facts = factsOf({
      stack: ['me-1-one', 'me-2-two', 'me-3-three'],
      branch: 'me-2-two',
      pulls: [pullOf('me-1-one', 11, 'MERGED'), pullOf('me-2-two', 12, 'OPEN')],
      pullNumbers: { 'me-3-three': 13 },
    });

    expect(spaceStackOf(facts, worktree.key)).toEqual({
      pulls: [
        {
          branch: 'me-1-one',
          ticket: 'ME-1',
          number: 11,
          title: 'Title of 11',
          state: 'merged',
          checkedOut: false,
          restack: 'none',
        },
        {
          branch: 'me-2-two',
          ticket: 'ME-2',
          number: 12,
          title: 'Title of 12',
          state: 'open',
          checkedOut: true,
          restack: 'none',
        },
        {
          branch: 'me-3-three',
          ticket: 'ME-3',
          number: 13,
          title: null,
          state: 'unknown',
          checkedOut: false,
          restack: 'none',
        },
      ],
      merged: 1,
      total: 3,
    });
  });

  test('a live pull whose number the stack records gives its title and state', () => {
    const facts = factsOf({
      stack: ['me-1-one'],
      branch: 'me-1-one',
      pulls: [pullOf('me-1-one', 11, 'MERGED')],
      pullNumbers: { 'me-1-one': 11 },
    });

    expect(spaceStackOf(facts, worktree.key)?.pulls).toEqual([
      {
        branch: 'me-1-one',
        ticket: 'ME-1',
        number: 11,
        title: 'Title of 11',
        state: 'merged',
        checkedOut: true,
        restack: 'none',
      },
    ]);
  });

  test('a live pull with another number keeps the recorded number and hides its state', () => {
    const facts = factsOf({
      stack: ['me-1-one'],
      branch: 'me-1-one',
      pulls: [pullOf('me-1-one', 99, 'MERGED')],
      pullNumbers: { 'me-1-one': 11 },
      restacks: { 'me-1-one': 'needed' },
    });

    expect(spaceStackOf(facts, worktree.key)?.pulls).toEqual([
      {
        branch: 'me-1-one',
        ticket: 'ME-1',
        number: 11,
        title: null,
        state: 'unknown',
        checkedOut: true,
        restack: 'needed',
      },
    ]);
  });

  test('a branch with no PR facts has unknown state', () => {
    const facts = factsOf({
      stack: ['me-1-one'],
      branch: 'me-1-one',
      pullNumbers: { 'me-1-one': 7 },
    });

    expect(spaceStackOf(facts, worktree.key)?.pulls).toEqual([
      {
        branch: 'me-1-one',
        ticket: 'ME-1',
        number: 7,
        title: null,
        state: 'unknown',
        checkedOut: true,
        restack: 'none',
      },
    ]);
  });

  test('a draft and a closed PR map to draft and closed', () => {
    const facts = factsOf({
      stack: ['me-1-one', 'me-2-two'],
      branch: 'me-1-one',
      pulls: [pullOf('me-1-one', 11, 'OPEN', true), pullOf('me-2-two', 12, 'CLOSED')],
    });

    const states = spaceStackOf(facts, worktree.key)?.pulls.map((pull) => pull.state);

    expect(states).toEqual(['draft', 'closed']);
  });
});

describe('stackTitleOf', () => {
  test('a stack whose tickets share a parent takes the parent title', () => {
    const facts = factsOf({
      stack: ['me-1-one', 'me-2-two'],
      branch: 'me-1-one',
      parents: { 'ME-1': 'ME-9', 'ME-2': 'ME-9' },
    });

    expect(stackTitleOf(facts, worktree.key)).toBe('Title of ME-9');
  });

  test('a stack with mixed parents keeps the ticket title', () => {
    const facts = factsOf({
      stack: ['me-1-one', 'me-2-two'],
      branch: 'me-1-one',
      parents: { 'ME-1': 'ME-9', 'ME-2': 'ME-8' },
    });

    expect(stackTitleOf(facts, worktree.key)).toBeNull();
  });

  test('a parent whose facts were not read keeps the ticket title', () => {
    const facts = factsOf({
      stack: ['me-1-one'],
      branch: 'me-1-one',
      parents: { 'ME-1': 'ME-9' },
      readParent: false,
    });

    expect(stackTitleOf(facts, worktree.key)).toBeNull();
  });
});
