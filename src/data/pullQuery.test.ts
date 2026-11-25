import { describe, expect, test } from 'bun:test';

import { branchesPerQuery, pullQueryArgs } from './pullQuery.ts';

const queryTextOf = (args: readonly string[]): string => {
  const queryIndex = args.indexOf('-f');
  const queryArgument = args.slice(queryIndex).find((argument) => argument.startsWith('query='));

  return queryArgument ?? '';
};

const branchesOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `branch-${index}`);

const flagBeforeOf = (args: readonly string[], field: string): string | undefined => {
  const index = args.indexOf(field);

  return index === -1 ? undefined : args[index - 1];
};

describe('pullQueryArgs', () => {
  test('keeps branch names out of the query text', () => {
    const args = pullQueryArgs(['main', 'a"b'], null);
    const query = queryTextOf(args);

    expect(query).not.toContain('"main"');
    expect(query).not.toContain('a"b');
    expect(args).toContain('branch0=main');
    expect(args).toContain('branch1=a"b');
  });

  test('asks two aliases per branch', () => {
    const query = queryTextOf(pullQueryArgs(branchesOf(3), null));

    for (const index of [0, 1, 2]) {
      expect(query).toContain(`open${index}:`);
      expect(query).toContain(`latest${index}:`);
    }

    expect(query).not.toContain('open3:');
  });

  test('sends the owner and repository as raw strings', () => {
    const args = pullQueryArgs(['main'], {
      host: 'github.com',
      owner: '1234',
      repository: '5678',
    });

    expect(flagBeforeOf(args, 'owner=1234')).toBe('-f');
    expect(flagBeforeOf(args, 'name=5678')).toBe('-f');
  });

  test('sends the owner and repository placeholders as fields', () => {
    const args = pullQueryArgs(['main'], null);

    expect(flagBeforeOf(args, 'owner={owner}')).toBe('-F');
    expect(flagBeforeOf(args, 'name={repo}')).toBe('-F');
  });

  test('refuses an empty or oversized batch', () => {
    expect(() => pullQueryArgs([], null)).toThrow();
    expect(() => pullQueryArgs(branchesOf(branchesPerQuery + 1), null)).toThrow();
    expect(() => pullQueryArgs(branchesOf(branchesPerQuery), null)).not.toThrow();
  });
});
