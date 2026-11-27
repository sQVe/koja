import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExecResult } from 'herdr';

import type { RunCommand } from '../src/data/gitIdentity.ts';
import type {
  PullChecks,
  PullMergeable,
  PullMergeState,
  PullReview,
} from '../src/data/pullAnswer.ts';
import type { Pull } from '../src/data/pulls.ts';
import { partValueOf } from '../src/data/pulls.ts';

export interface Answer {
  body: string;
  code?: number;
  stderr?: string;
}

export const githubFixture = (name: string): string =>
  readFileSync(join(import.meta.dir, '..', 'src', 'data', 'fixtures', 'github', name), 'utf8');

const answerOf = (answer: Answer): ExecResult => ({
  code: answer.code ?? 0,
  stdout: answer.body,
  stderr: answer.stderr ?? '',
});

const gitAnswer = (args: string[]): ExecResult => {
  if (args[1] === 'get-url') {
    return { code: 0, stdout: '/srv/git/repo.git\n', stderr: '' };
  }

  return { code: 0, stdout: 'origin\n', stderr: '' };
};

export const runWith = (
  answers: Answer[],
  calls: string[][] = [],
  unexpectedCalls: string[][] = [],
): RunCommand => {
  const pending = [...answers];

  return async (command, args) => {
    if (command === 'git') {
      return gitAnswer(args);
    }

    calls.push(args);

    const answer = pending.shift();

    if (answer === undefined) {
      unexpectedCalls.push(args);

      return {
        code: 1,
        stdout: '',
        stderr: `unexpected gh call: ${args.join(' ')}`,
      };
    }

    return answerOf(answer);
  };
};

export const formFieldOf = (args: string[], field: string): string | undefined => {
  for (const [index, argument] of args.entries()) {
    const value = args[index + 1];

    if (argument !== '-f' && argument !== '-F') {
      continue;
    }

    if (value === undefined) {
      continue;
    }

    if (value.startsWith(`${field}=`)) {
      return value.slice(field.length + 1);
    }
  }

  return undefined;
};

export const bodyOf = (
  branchCount: number,
  nodes: { open?: Record<number, unknown>; latest?: Record<number, unknown> } = {},
): string => {
  const repository: Record<string, unknown> = {};

  for (let index = 0; index < branchCount; index += 1) {
    const open = nodes.open?.[index];
    const latest = nodes.latest?.[index];

    repository[`open${index}`] = { nodes: open === undefined ? [] : [open] };
    repository[`latest${index}`] = { nodes: latest === undefined ? [] : [latest] };
  }

  const body = {
    data: {
      rateLimit: { cost: 1, remaining: 4000, resetAt: '2026-11-25T12:00:00Z' },
      repository,
    },
  };

  return JSON.stringify(body);
};

const mergeableNames: Record<PullMergeable, string> = {
  mergeable: 'MERGEABLE',
  conflicting: 'CONFLICTING',
  unknown: 'UNKNOWN',
};

const mergeStateNames: Record<PullMergeState, string> = {
  clean: 'CLEAN',
  hasHooks: 'HAS_HOOKS',
  blocked: 'BLOCKED',
  behind: 'BEHIND',
  dirty: 'DIRTY',
  draft: 'DRAFT',
  unstable: 'UNSTABLE',
  unknown: 'UNKNOWN',
};

const reviewNames: Record<PullReview, string | null> = {
  approved: 'APPROVED',
  changesRequested: 'CHANGES_REQUESTED',
  reviewRequired: 'REVIEW_REQUIRED',
  none: null,
};

const checkStates: Record<PullChecks, string | null> = {
  passing: 'SUCCESS',
  failing: 'FAILURE',
  running: 'PENDING',
  none: null,
};

// The answer cannot say a part is unread: an unread part encodes as an empty node list, and the
// read decodes that back as a read part with no checks or threads. Compare a decoded pull's parts
// only when the pull you gave had them read.
const checksNodeOf = (pull: Pull): Record<string, unknown> => {
  const checks = partValueOf(pull.checks);
  const state = checks === null ? null : checkStates[checks];

  if (state === null) {
    return { nodes: [] };
  }

  return { nodes: [{ commit: { statusCheckRollup: { state } } }] };
};

const threadsNodeOf = (pull: Pull): Record<string, unknown> => {
  const threads = partValueOf(pull.threads);

  if (threads === null) {
    return { pageInfo: { hasNextPage: false }, nodes: [] };
  }

  const nodes = Array.from({ length: threads.unresolved }, () => ({ isResolved: false }));

  return { pageInfo: { hasNextPage: !threads.complete }, nodes };
};

export const pullNodeOf = (pull: Pull): Record<string, unknown> => ({
  number: pull.number,
  state: pull.state,
  isDraft: pull.isDraft,
  title: pull.title,
  url: pull.url,
  headRefName: pull.headRefName,
  mergeable: mergeableNames[pull.mergeable],
  mergeStateStatus: mergeStateNames[pull.mergeState],
  reviewDecision: reviewNames[pull.review],
  commits: checksNodeOf(pull),
  reviewThreads: threadsNodeOf(pull),
});

export const branchCountOf = (args: string[]): number =>
  args.filter((argument) => argument.startsWith('branch')).length;

export const answerFrom = (branchCount: number, pulls: Pull[]): string => {
  const open: Record<number, unknown> = {};
  const latest: Record<number, unknown> = {};

  for (const [index, pull] of pulls.entries()) {
    const nodes = pull.state === 'OPEN' ? open : latest;

    nodes[index] = pullNodeOf(pull);
  }

  return bodyOf(branchCount, { open, latest });
};
