import type { PaneInfo, SpaceInfo } from 'herdr';

import { placeOfSpace } from '../../data/places.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { SpaceStack, StackPull } from '../../data/spaceStack.ts';
import { spaceStackOf } from '../../data/spaceStack.ts';
import { bestFieldMatch } from './match.ts';

export interface StackReason {
  value: string;
  position: number;
  total: number;
  state: 'open' | 'draft' | 'merged' | 'closed' | null;
}

type StackTier = 'exact' | 'field';

export interface StackMatch {
  tier: StackTier;
  score: number;
  reason: StackReason;
}

interface Ranked {
  tier: StackTier;
  score: number;
}

interface PullMatch extends Ranked {
  value: string;
}

const numberOf = (query: string): string | null => {
  const digits = query.startsWith('#') ? query.slice(1) : query;

  return /^\d+$/.test(digits) ? digits : null;
};

const stateOf = (pull: StackPull): StackReason['state'] =>
  pull.state === 'unknown' ? null : pull.state;

const exactMatchOf = (digits: string | null, pull: StackPull): PullMatch | null => {
  if (digits === null || pull.number === null || String(pull.number) !== digits) {
    return null;
  }

  return { tier: 'exact', score: 0, value: `#${pull.number}` };
};

// A ticket and a branch are scored together, so the ticket wins a tie.
const matchOfPull = (query: string, digits: string | null, pull: StackPull): PullMatch | null => {
  const exact = exactMatchOf(digits, pull);

  if (exact !== null) {
    return exact;
  }

  const match = bestFieldMatch(query, [pull.ticket, pull.branch]);

  return match === null ? null : { tier: 'field', score: match.score, value: match.field };
};

const outranks = (candidate: Ranked, best: Ranked): boolean => {
  if (candidate.tier !== best.tier) {
    return candidate.tier === 'exact';
  }

  return candidate.score > best.score;
};

const worktreeKeyAtPlace = (facts: Facts, placeKey: string): string | null => {
  const entry = facts.git.places[placeKey];

  return entry?.kind === 'repository' ? entry.worktree : null;
};

// Stack search reads the same recorded place the row facts use, and only when a query runs.
export const stackForSpace = (
  facts: Facts | null,
  space: SpaceInfo,
  paneList: PaneInfo[],
): SpaceStack | null => {
  if (facts === null) {
    return null;
  }

  const place = placeOfSpace(space, paneList);
  const worktreeKey = worktreeKeyAtPlace(facts, place.key);

  return worktreeKey === null ? null : spaceStackOf(facts, worktreeKey);
};

export const stackMatchOf = (query: string, stack: SpaceStack | null): StackMatch | null => {
  if (stack === null || query === '') {
    return null;
  }

  const digits = numberOf(query);
  let best: StackMatch | null = null;

  for (const [index, pull] of stack.pulls.entries()) {
    const match = matchOfPull(query, digits, pull);

    if (match === null) {
      continue;
    }

    if (best !== null && !outranks(match, best)) {
      continue;
    }

    best = {
      tier: match.tier,
      score: match.score,
      reason: {
        value: match.value,
        position: index + 1,
        total: stack.total,
        state: stateOf(pull),
      },
    };
  }

  return best;
};
