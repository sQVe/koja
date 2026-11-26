import { ticketIdOf } from './linearTickets.ts';
import type { Pull } from './pulls.ts';
import type { Facts, TicketFacts } from './snapshot.ts';
import { pullOfBranch } from './snapshot.ts';
import type { Stack, StackBranch } from './stacks.ts';
import { stackOfBranch } from './stacks.ts';

interface StackPull {
  branch: string;
  ticket: string | null;
  number: number | null;
  title: string | null;
  state: 'open' | 'draft' | 'merged' | 'closed' | 'unknown';
  checkedOut: boolean;
  restack: StackBranch['restack'];
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

const worktreeStackOf = (facts: Facts, worktreeKey: string): WorktreeStack | null => {
  const worktree = facts.git.worktrees[worktreeKey];

  if (worktree === undefined) {
    return null;
  }

  const recorded = facts.stacks[worktree.repository.key]?.stacks ?? [];
  const stack = stackOfBranch(recorded, worktree.branch);

  if (stack === null) {
    return null;
  }

  return { stack, branch: worktree.branch, repositoryKey: worktree.repository.key };
};

const stackPullOf = (
  facts: Facts,
  repositoryKey: string,
  entry: StackBranch,
  branch: string | null,
): StackPull => {
  const pull = pullOfBranch(facts.pulls[repositoryKey] ?? null, entry.branch);

  return {
    branch: entry.branch,
    ticket: ticketIdOf(entry.branch, ''),
    number: pull?.number ?? entry.pullNumber,
    title: pull?.title ?? null,
    state: stateOf(pull),
    checkedOut: entry.branch === branch,
    restack: entry.restack,
  };
};

export const spaceStackOf = (facts: Facts, worktreeKey: string): SpaceStack | null => {
  const found = worktreeStackOf(facts, worktreeKey);

  if (found === null) {
    return null;
  }

  const pulls = found.stack.branches.map((entry) =>
    stackPullOf(facts, found.repositoryKey, entry, found.branch),
  );

  return {
    pulls,
    merged: pulls.filter((pull) => pull.state === 'merged').length,
    total: pulls.length,
  };
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
export const stackTitleOf = (facts: Facts, worktreeKey: string): string | null => {
  const found = worktreeStackOf(facts, worktreeKey);

  if (found === null) {
    return null;
  }

  const tickets = facts.trackers[found.repositoryKey]?.tickets ?? {};
  const parent = sharedParentOf(found.stack.branches, tickets);

  return parent === null ? null : (tickets[parent]?.title ?? null);
};
