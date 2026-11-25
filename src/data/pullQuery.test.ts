import { describe, expect, test } from 'bun:test';

import { branchesPerQuery, pullQueryArgs } from './pullQuery.ts';

const queryTextOf = (args: readonly string[]): string => {
  const queryIndex = args.indexOf('-f');
  const queryArgument = args.slice(queryIndex).find((argument) => argument.startsWith('query='));

  return queryArgument ?? '';
};

const branchesOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `branch-${index}`);

describe('pullQueryArgs', () => {
  test('keeps branch names out of the query text', () => {
    const args = pullQueryArgs(['main', 'a"b']);
    const query = queryTextOf(args);

    expect(query).not.toContain('"main"');
    expect(query).not.toContain('a"b');
    expect(args).toContain('branch0=main');
    expect(args).toContain('branch1=a"b');
  });

  test('asks two aliases per branch', () => {
    const query = queryTextOf(pullQueryArgs(branchesOf(3)));

    for (const index of [0, 1, 2]) {
      expect(query).toContain(`open${index}:`);
      expect(query).toContain(`latest${index}:`);
    }

    expect(query).not.toContain('open3:');
  });

  test('refuses an empty or oversized batch', () => {
    expect(() => pullQueryArgs([])).toThrow();
    expect(() => pullQueryArgs(branchesOf(branchesPerQuery + 1))).toThrow();
    expect(() => pullQueryArgs(branchesOf(branchesPerQuery))).not.toThrow();
  });
});
