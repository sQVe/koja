import { describe, expect, test } from 'bun:test';

import { ghStackRecord, severalStacksHeads } from '../../tests/stackFixtures.ts';
import { isRecord } from '../kit/fields.ts';
import { parsedJson } from '../kit/parsedJson.ts';
import type { Stack, StackBranch } from './stacks.ts';
import { parseStacks, stackOfBranch } from './stacks.ts';

const parsedStacks = (name: string, heads: ReadonlyMap<string, string>): Stack[] => {
  const parsed = parseStacks(ghStackRecord(name), heads);

  if (parsed.kind === 'failed') {
    throw new Error(`${name}.json did not parse`);
  }

  return parsed.stacks;
};

const branchesOf = (stacks: readonly Stack[]): StackBranch[] =>
  stacks.flatMap((stack) => stack.branches);

const branchNamesOf = (stack: Stack | null): string[] =>
  stack === null ? [] : stack.branches.map((entry) => entry.branch);

const recordOfSeveralStacks = (): Record<string, unknown> => {
  const record = parsedJson(ghStackRecord('several-stacks'));

  if (!isRecord(record)) {
    throw new Error('several-stacks.json is not a record');
  }

  return record;
};

const restackOfBranch = (
  stacks: readonly Stack[],
  branch: string,
): StackBranch['restack'] | null => {
  const found = stackOfBranch(stacks, branch);
  const entry = found?.branches.find((candidate) => candidate.branch === branch);

  return entry?.restack ?? null;
};

// The bases recorded in the fixture, so every branch matches the head of the branch below it.
describe('stacks', () => {
  test('parseStacks reads every stack of a real record', () => {
    const parsed = parseStacks(ghStackRecord('several-stacks'), severalStacksHeads);

    expect(parsed).toEqual({
      kind: 'parsed',
      stacks: [
        {
          trunk: 'main',
          branches: [
            { branch: 'add-search', pullNumber: null, restack: 'none' },
            { branch: 'add-search-ui', pullNumber: null, restack: 'none' },
            { branch: 'add-search-tests', pullNumber: null, restack: 'none' },
          ],
        },
        {
          trunk: 'main',
          branches: [
            { branch: 'fix-crash', pullNumber: null, restack: 'none' },
            { branch: 'fix-crash-tests', pullNumber: null, restack: 'none' },
          ],
        },
      ],
    });
  });

  test('stackOfBranch attaches a stack by the branch it holds', () => {
    const stacks = parsedStacks('several-stacks', severalStacksHeads);
    const sharedBranch: StackBranch = { branch: 'shared', pullNumber: null, restack: 'none' };

    const twice = stacks.map((stack) => ({
      ...stack,
      branches: [...stack.branches, sharedBranch],
    }));

    expect(branchNamesOf(stackOfBranch(stacks, 'add-search'))).toEqual([
      'add-search',
      'add-search-ui',
      'add-search-tests',
    ]);

    expect(branchNamesOf(stackOfBranch(stacks, 'fix-crash'))).toEqual([
      'fix-crash',
      'fix-crash-tests',
    ]);

    expect(stackOfBranch(stacks, 'experiment')).toBeNull();
    expect(stackOfBranch(stacks, null)).toBeNull();
    expect(stackOfBranch(twice, 'shared')).toBeNull();
  });

  test('parseStacks fails a truncated record', () => {
    expect(parseStacks(ghStackRecord('truncated'), severalStacksHeads)).toEqual({ kind: 'failed' });
  });

  test('parseStacks fails an unknown schema version', () => {
    const raised = JSON.stringify({ ...recordOfSeveralStacks(), schemaVersion: 2 });

    expect(parseStacks(raised, severalStacksHeads)).toEqual({ kind: 'failed' });
  });

  test('parseStacks fails a record without a required field', () => {
    const withoutStacks = JSON.stringify({ schemaVersion: 1, repository: '' });

    const withoutTrunkBranch = JSON.stringify({
      schemaVersion: 1,
      repository: '',
      stacks: [{ trunk: { head: 'abc' }, branches: [] }],
    });

    const withoutBranchName = JSON.stringify({
      schemaVersion: 1,
      repository: '',
      stacks: [{ trunk: { branch: 'main' }, branches: [{ base: 'abc' }] }],
    });

    expect(parseStacks(withoutStacks, severalStacksHeads)).toEqual({ kind: 'failed' });
    expect(parseStacks(withoutTrunkBranch, severalStacksHeads)).toEqual({ kind: 'failed' });
    expect(parseStacks(withoutBranchName, severalStacksHeads)).toEqual({ kind: 'failed' });
  });

  test("a branch whose base is not its parent's head needs a restack", () => {
    // `add-search` moved after `add-search-ui` recorded its base.
    const heads = new Map([
      ['main', 'fcacf79ff51ea778293a32460b14066356f3318d'],
      ['add-search', '1111111111111111111111111111111111111111'],
      ['add-search-ui', 'd05d6218226bd13d48cbf8d4a00df774dbb45cb2'],
    ]);

    const stacks = parsedStacks('several-stacks', heads);
    const restacks = branchesOf(stacks).map((entry) => [entry.branch, entry.restack]);

    expect(restacks).toEqual([
      ['add-search', 'none'],
      ['add-search-ui', 'needed'],
      ['add-search-tests', 'none'],
      ['fix-crash', 'none'],
      ['fix-crash-tests', 'unknown'],
    ]);
  });

  test('a branch with no recorded base gives unknown', () => {
    const withoutBase = parsedStacks('no-base', severalStacksHeads);

    const withoutParentHead = parsedStacks(
      'several-stacks',
      new Map([
        ['main', 'fcacf79ff51ea778293a32460b14066356f3318d'],
        ['add-search-ui', 'd05d6218226bd13d48cbf8d4a00df774dbb45cb2'],
      ]),
    );

    expect(restackOfBranch(withoutBase, 'add-search-ui')).toBe('unknown');
    expect(restackOfBranch(withoutBase, 'add-search')).toBe('none');
    expect(restackOfBranch(withoutParentHead, 'add-search-ui')).toBe('unknown');
  });

  test('a base of the wrong type reads like a missing base', () => {
    const record = recordOfSeveralStacks();
    const stacks = record['stacks'];

    if (Array.isArray(stacks) && isRecord(stacks[0])) {
      const branches = stacks[0]['branches'];

      if (Array.isArray(branches) && isRecord(branches[1])) {
        branches[1]['base'] = 42;
      }
    }

    const parsed = parseStacks(JSON.stringify(record), severalStacksHeads);

    expect(parsed.kind).toBe('parsed');

    if (parsed.kind === 'parsed') {
      expect(restackOfBranch(parsed.stacks, 'add-search-ui')).toBe('unknown');
    }
  });

  test('a malformed pull request reads like a missing one', () => {
    const record = recordOfSeveralStacks();
    const stacks = record['stacks'];

    if (Array.isArray(stacks) && isRecord(stacks[0])) {
      const branches = stacks[0]['branches'];

      if (Array.isArray(branches) && isRecord(branches[0])) {
        branches[0]['pullRequest'] = 42;
      }
    }

    const parsed = parseStacks(JSON.stringify(record), severalStacksHeads);

    expect(parsed.kind).toBe('parsed');

    if (parsed.kind === 'parsed') {
      const [first] = branchesOf(parsed.stacks);

      expect(first?.pullNumber).toBeNull();
    }
  });

  test('a paused rebase still parses', () => {
    const heads = new Map([
      ['main', 'ea3a03f12aa74c3470bd72a6dcdc1e76e79fcfce'],
      ['layer-one', '90ed17e4f3a75eb2bb778055373d81fa21ef3b0a'],
      ['layer-two', '689716b4b14e26c784b066e5aca98253fb4957cb'],
      ['layer-three', 'e30ac897ea56e08c39993411c2a0a3df0888ca23'],
    ]);

    expect(parseStacks(ghStackRecord('paused-rebase'), heads)).toEqual({
      kind: 'parsed',
      stacks: [
        {
          trunk: 'main',
          branches: [
            { branch: 'layer-one', pullNumber: null, restack: 'none' },
            { branch: 'layer-two', pullNumber: null, restack: 'none' },
            { branch: 'layer-three', pullNumber: null, restack: 'none' },
          ],
        },
      ],
    });
  });

  test('a recorded pull request number reaches the branch', () => {
    const stacks = parsedStacks('merged', severalStacksHeads);
    const pullNumbers = branchesOf(stacks).map((entry) => [entry.branch, entry.pullNumber]);

    expect(pullNumbers).toEqual([
      ['add-search', null],
      ['add-search-ui', 412],
      ['add-search-tests', null],
      ['fix-crash', null],
      ['fix-crash-tests', null],
    ]);
  });
});
