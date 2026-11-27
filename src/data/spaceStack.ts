import { ticketIdOf } from './linearTickets.ts';
import type { StackNeed } from './pullNeeds.ts';
import { mostBlockingNeed, pullStackNeed } from './pullNeeds.ts';
import type { Pull } from './pulls.ts';
import type { Facts, TicketFacts, WorktreeGit } from './snapshot.ts';
import { pullOfBranch } from './snapshot.ts';
import type { Stack, StackBranch } from './stacks.ts';
import { stackOfBranch } from './stacks.ts';

export interface StackPull {
  branch: string;
  ticket: string | null;
  number: number | null;
  title: string | null;
  state: 'open' | 'draft' | 'merged' | 'closed' | 'unknown';
  checkedOut: boolean;
  restack: StackBranch['restack'];
  need: StackNeed | null;
}

export interface SpaceStack {
  pulls: StackPull[];
  merged: number;
  total: number;
}

interface WorktreeStack {
  stack: Stack;
  branch: string | null;
  repositoryKey: string;
}

export interface WorktreeStackFacts {
  stack: SpaceStack | null;
  title: string | null;
  need: StackNeed | null;
}

const stateOf = (pull: Pull | null): StackPull['state'] => {
  if (pull === null) {
    return 'unknown';
  }

  if (pull.state === 'OPEN') {
    return pull.isDraft ? 'draft' : 'open';
  }

  if (pull.state === 'MERGED') {
    return 'merged';
  }

  if (pull.state === 'CLOSED') {
    return 'closed';
  }

  return 'unknown';
};

const worktreeStackOf = (facts: Facts, worktree: WorktreeGit): WorktreeStack | null => {
  const recorded = facts.stacks[worktree.repository.key]?.stacks ?? [];
  const stack = stackOfBranch(recorded, worktree.branch);

  if (stack === null) {
    return null;
  }

  return { stack, branch: worktree.branch, repositoryKey: worktree.repository.key };
};

const pullOfNumber = (facts: Facts, repositoryKey: string, number: number): Pull | null =>
  facts.pulls[repositoryKey]?.pulls.find((candidate) => candidate.number === number) ?? null;

const stackPullOf = (
  facts: Facts,
  repositoryKey: string,
  entry: StackBranch,
  branch: string | null,
): StackPull => {
  const live = pullOfBranch(facts.pulls[repositoryKey] ?? null, entry.branch);
  const recorded = entry.pullNumber;

  // A live pull is found by head branch alone, and a fork can reuse the name. The recorded number
  // wins when the live pull reports another one, so read that pull by number.
  let pull = live;

  if (recorded !== null && live?.number !== recorded) {
    pull = pullOfNumber(facts, repositoryKey, recorded);
  }

  return {
    branch: entry.branch,
    ticket: ticketIdOf(entry.branch, ''),
    number: pull?.number ?? recorded,
    title: pull?.title ?? null,
    state: stateOf(pull),
    checkedOut: entry.branch === branch,
    restack: entry.restack,
    need: pullStackNeed(pull, entry.restack),
  };
};

const stackIn = (facts: Facts, found: WorktreeStack): SpaceStack => {
  const pulls = found.stack.branches.map((entry) =>
    stackPullOf(facts, found.repositoryKey, entry, found.branch),
  );

  return {
    pulls,
    merged: pulls.filter((pull) => pull.state === 'merged').length,
    total: pulls.length,
  };
};

export const branchNeedOf = (
  facts: Facts,
  repositoryKey: string,
  branch: string | null,
): StackNeed | null => {
  const pull = pullOfBranch(facts.pulls[repositoryKey] ?? null, branch);

  return pullStackNeed(pull, 'none');
};

const parentOf = (tickets: Record<string, TicketFacts>, branch: string): string | null => {
  const id = ticketIdOf(branch, '');

  return id === null ? null : (tickets[id]?.parent ?? null);
};

const sharedParentOf = (
  branches: readonly StackBranch[],
  tickets: Record<string, TicketFacts>,
): string | null => {
  const parents = new Set<string>();

  for (const entry of branches) {
    const parent = parentOf(tickets, entry.branch);

    if (parent === null) {
      return null;
    }

    parents.add(parent);
  }

  const [parent] = parents;

  return parents.size === 1 && parent !== undefined ? parent : null;
};

// A stack takes its shared parent's title only when every branch names a ticket, those tickets all
// name the same parent, and that parent's facts were read.
const stackTitleIn = (facts: Facts, found: WorktreeStack): string | null => {
  const tickets = facts.trackers[found.repositoryKey]?.tickets ?? {};
  const parent = sharedParentOf(found.stack.branches, tickets);

  return parent === null ? null : (tickets[parent]?.title ?? null);
};

export const worktreeStackFactsOf = (
  facts: Facts,
  worktreeKey: string,
): WorktreeStackFacts | null => {
  const worktree = facts.git.worktrees[worktreeKey];

  if (worktree === undefined) {
    return null;
  }

  const found = worktreeStackOf(facts, worktree);

  if (found === null) {
    return {
      stack: null,
      title: null,
      need: branchNeedOf(facts, worktree.repository.key, worktree.branch),
    };
  }

  const stack = stackIn(facts, found);

  return {
    stack,
    title: stackTitleIn(facts, found),
    need: mostBlockingNeed(stack.pulls.map((pull) => pull.need)),
  };
};

export const spaceStackOf = (facts: Facts, worktreeKey: string): SpaceStack | null =>
  worktreeStackFactsOf(facts, worktreeKey)?.stack ?? null;

export const spaceNeedOf = (facts: Facts, worktreeKey: string): StackNeed | null =>
  worktreeStackFactsOf(facts, worktreeKey)?.need ?? null;
