import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExecResult } from 'herdr';

import type { RunCommand } from '../src/data/gitIdentity.ts';
import type { Pull } from '../src/data/pulls.ts';

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

export const runWith = (answers: Answer[], calls: string[][] = []): RunCommand => {
  const pending = [...answers];

  return async (command, args) => {
    if (command === 'git') {
      return gitAnswer(args);
    }

    calls.push(args);

    const answer = pending.shift();

    if (answer === undefined) {
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    }

    return answerOf(answer);
  };
};

export const formFieldOf = (args: string[], field: string): string | undefined => {
  for (const [index, argument] of args.entries()) {
    const value = args[index + 1];

    if (argument !== '-f' || value === undefined) {
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

export const pullNodeOf = (pull: Pull): Record<string, unknown> => ({
  number: pull.number,
  state: pull.state,
  isDraft: pull.isDraft,
  title: pull.title,
  headRefName: pull.headRefName,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: 'APPROVED',
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
});

export const answerFrom = (branchCount: number, pulls: Pull[]): string =>
  bodyOf(branchCount, {
    open: Object.fromEntries(pulls.map((pull, index) => [index, pullNodeOf(pull)])),
  });
