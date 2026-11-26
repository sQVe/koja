import type { SpaceStack, StackPull } from '../../data/spaceStack.ts';
import { fuzzyMatch, scoreCeiling } from './match.ts';

export interface StackReason {
  value: string;
  position: number;
  total: number;
  state: 'open' | 'draft' | 'merged' | 'closed' | null;
}

interface PullMatch {
  score: number;
  value: string;
}

// A PR number matches only exactly, with or without its `#`.
const numberOf = (query: string): string | null => {
  const digits = query.startsWith('#') ? query.slice(1) : query;

  return /^\d+$/.test(digits) ? digits : null;
};

const stateOf = (pull: StackPull): StackReason['state'] =>
  pull.state === 'unknown' ? null : pull.state;

const fieldMatchOf = (query: string, pull: StackPull): PullMatch | null => {
  const ticketId = pull.ticket;
  const ticketMatch = ticketId === null ? null : fuzzyMatch(query, ticketId);
  const branchMatch = fuzzyMatch(query, pull.branch);

  if (ticketMatch !== null && ticketId !== null) {
    if (branchMatch === null || ticketMatch.score >= branchMatch.score) {
      return { score: ticketMatch.score, value: ticketId };
    }
  }

  return branchMatch === null ? null : { score: branchMatch.score, value: pull.branch };
};

const matchOfPull = (query: string, digits: string | null, pull: StackPull): PullMatch | null => {
  if (digits !== null && pull.number !== null && String(pull.number) === digits) {
    return { score: 2 * scoreCeiling(query) + 1, value: `#${pull.number}` };
  }

  return fieldMatchOf(query, pull);
};

// Every PR of the stack is searched, merged ones included, so a space can be found by a PR it
// already landed.
export const stackMatchOf = (
  query: string,
  stack: SpaceStack | null,
): { score: number; reason: StackReason } | null => {
  if (stack === null || query === '') {
    return null;
  }

  const digits = numberOf(query);
  let best: { score: number; reason: StackReason } | null = null;

  for (const [index, pull] of stack.pulls.entries()) {
    const match = matchOfPull(query, digits, pull);
    const beaten = best !== null && match !== null && match.score <= best.score;

    // Equal scores keep the lower PR, so only a strictly better match replaces the reason.
    if (match === null || beaten) {
      continue;
    }

    best = {
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
