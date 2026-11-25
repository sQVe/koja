import type { RepositoryReadTimes } from './pullReadTimes.ts';
import type { Pull, PullPart } from './pulls.ts';
import { partValueOf } from './pulls.ts';

const mergePart = <T>(part: PullPart<T>, previous: PullPart<T> | undefined): PullPart<T> => {
  if (part.kind !== 'failed' || part.last !== null || previous === undefined) {
    return part;
  }

  const last = partValueOf(previous);

  return last === null ? part : { kind: 'failed', last };
};

export const mergePulls = (previous: Pull[], read: Pull[]): Pull[] => {
  const byNumber = new Map(previous.map((pull) => [pull.number, pull]));

  return read.map((pull) => {
    const last = byNumber.get(pull.number);

    if (last === undefined) {
      return pull;
    }

    return {
      ...pull,
      checks: mergePart(pull.checks, last.checks),
      threads: mergePart(pull.threads, last.threads),
    };
  });
};

export const mergeReadTimes = (
  previous: RepositoryReadTimes | undefined,
  pulls: Pull[],
  now: number,
): RepositoryReadTimes => {
  const checks: Record<string, number> = {};
  const threads: Record<string, number> = {};

  for (const pull of pulls) {
    const key = String(pull.number);

    if (pull.checks.kind === 'read') {
      checks[key] = now;
    } else if (pull.checks.kind === 'failed' && previous?.checks[key] !== undefined) {
      checks[key] = previous.checks[key];
    }

    if (pull.threads.kind === 'read') {
      threads[key] = now;
    } else if (pull.threads.kind === 'failed' && previous?.threads[key] !== undefined) {
      threads[key] = previous.threads[key];
    }
  }

  return { list: now, checks, threads };
};
