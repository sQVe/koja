import { describe, expect, test } from 'bun:test';

import { repositoryOf } from '../../data/gitIdentity.ts';
import { negativeEntryExpired, pruneRecord, retireUnusedWatches } from './cache.ts';
import type { GitInfo } from './tree.ts';

const gitInfo = (repo: string, machine: string | null = null): GitInfo => ({
  branch: null,
  repo: repositoryOf(machine, repo),
  root: '/',
  cwd: '/',
  linked: false,
});

describe('pruneRecord', () => {
  test('drops entries whose place is no longer shown', () => {
    const cache = { a: 1, b: 2 };

    expect(pruneRecord(cache, new Set(['a']))).toEqual({ a: 1 });
  });

  test('keeps every entry while all places are shown', () => {
    const cache = { a: 1, b: 2 };

    expect(pruneRecord(cache, new Set(['a', 'b']))).toEqual(cache);
  });
});

describe('negativeEntryExpired', () => {
  test('keeps a negative entry until the retry time passes', () => {
    expect(negativeEntryExpired(1_000, 61_000, 60_000)).toBe(false);
  });

  test('expires a negative entry after the retry time', () => {
    expect(negativeEntryExpired(1_000, 61_001, 60_000)).toBe(true);
  });
});

describe('retireUnusedWatches', () => {
  const key = repositoryOf(null, 'repoA').key;

  test('retires a watcher once its last place is pruned', () => {
    expect(retireUnusedWatches(new Set([key]), {})).toEqual(new Set());
  });

  test('keeps a watcher while a local place uses it', () => {
    const git: Record<string, GitInfo | null> = { place: gitInfo('repoA') };

    expect(retireUnusedWatches(new Set([key]), git)).toEqual(new Set([key]));
  });

  test('retires a watcher that only a repository on another machine uses', () => {
    const remote = gitInfo('repoA', 'work');
    const git: Record<string, GitInfo | null> = { place: remote };

    expect(retireUnusedWatches(new Set([key, remote.repo.key]), git)).toEqual(new Set());
  });

  test('keeps the local watcher and retires the remote one', () => {
    const git: Record<string, GitInfo | null> = {
      local: gitInfo('repoA'),
      remote: gitInfo('repoB', 'work'),
      missing: null,
    };

    const watching = new Set([key, repositoryOf('work', 'repoB').key]);

    expect(retireUnusedWatches(watching, git)).toEqual(new Set([key]));
  });
});
