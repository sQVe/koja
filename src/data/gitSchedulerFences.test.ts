import { beforeEach, describe, expect, test } from 'bun:test';

import {
  GitSchedulerHarness,
  mainCheckout,
  placeKeyOf,
  spaceOf,
  worldOf,
} from '../../tests/gitSchedulerHarness.ts';
import { worktreeOf } from './gitIdentity.ts';
import type { Lease } from './lease.ts';
import { emptyFacts } from './snapshot.ts';

const harness = new GitSchedulerHarness();

const hasOldBranch = (facts: { git: { worktrees: Record<string, { branch: string | null }> } }) =>
  Object.values(facts.git.worktrees).some((worktree) => worktree.branch === 'old');

beforeEach(() => {
  harness.reset();
});

describe('createGitScheduler fences', () => {
  test('starts no read without the lease', () => {
    harness.held = null;

    const scheduler = harness.start();

    const spaces = [spaceOf('s1', '/code/a'), spaceOf('s2', '/code/b'), spaceOf('s3', '/code/c')];

    scheduler.tick(worldOf(spaces), harness.context);

    expect(harness.started).toHaveLength(0);
  });

  test('drops a result after the lease moves on', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/koja')]), harness.context);
    expect(harness.started).toHaveLength(1);

    harness.held = { version: 1, owner: 'owner-b', generation: 2 };
    await harness.complete(harness.startedAt(0));

    expect(harness.published).toHaveLength(0);
    expect(scheduler.facts()).toEqual(emptyFacts());
  });

  test('drops a result when only the generation moves on', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/koja')]), harness.context);
    expect(harness.started).toHaveLength(1);

    harness.held = { version: 1, owner: 'owner-a', generation: 2 } satisfies Lease;
    await harness.complete(harness.startedAt(0));

    expect(harness.published).toHaveLength(0);
    expect(scheduler.facts()).toEqual(emptyFacts());
  });

  test('starts no further read when the lease is lost mid-batch', () => {
    for (const folder of ['/code/a', '/code/b', '/code/c']) {
      harness.setFolder(null, folder, mainCheckout(folder));
    }

    const scheduler = harness.start();

    const world = worldOf([
      spaceOf('s1', '/code/a'),
      spaceOf('s2', '/code/b'),
      spaceOf('s3', '/code/c'),
    ]);

    let calls = 0;

    harness.heldLeaseOverride = () => {
      calls += 1;

      return calls === 1 ? harness.lease : null;
    };

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    harness.heldLeaseOverride = null;
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(3);
  });

  test('retries a live place that loses the worktree fence', async () => {
    harness.setFolder(null, '/code/a', { ...mainCheckout('/code/a'), branch: 'newer\n' });
    harness.setFolder(null, '/code/a/sub', { ...mainCheckout('/code/a'), branch: 'newer\n' });

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/a'), spaceOf('s2', '/code/a/sub')]);

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));

    const worktree = worktreeOf(null, '/code/a').key;

    expect(scheduler.facts().git.places[placeKeyOf(null, '/code/a/sub')]).toEqual({
      kind: 'repository',
      worktree,
    });

    harness.setFolder(null, '/code/a', { ...mainCheckout('/code/a'), branch: 'old\n' });
    await harness.complete(harness.startedAt(0));

    expect(scheduler.facts().git.places[placeKeyOf(null, '/code/a')]).toBeUndefined();

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(3);
    expect(harness.startedAt(2).folder).toBe('/code/a');

    harness.setFolder(null, '/code/a', { ...mainCheckout('/code/a'), branch: 'newer\n' });
    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts().git.places[placeKeyOf(null, '/code/a')]).toEqual({
      kind: 'repository',
      worktree,
    });

    expect(scheduler.facts().git.worktrees[worktree]?.branch).toBe('newer');
    expect(harness.published.some(hasOldBranch)).toBe(false);
  });

  test('does not retry a place that left before its result', async () => {
    harness.setFolder(null, '/code/a', mainCheckout('/code/a'));
    harness.setFolder(null, '/code/a/sub', mainCheckout('/code/a'));

    const scheduler = harness.start();
    const both = worldOf([spaceOf('s1', '/code/a'), spaceOf('s2', '/code/a/sub')]);

    scheduler.tick(both, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));
    scheduler.tick(worldOf([spaceOf('s2', '/code/a/sub')]), harness.context);
    await harness.complete(harness.startedAt(0));

    expect(harness.started).toHaveLength(2);

    scheduler.tick(worldOf([spaceOf('s2', '/code/a/sub')]), harness.context);
    expect(harness.started).toHaveLength(2);

    const left = placeKeyOf(null, '/code/a');

    expect(scheduler.facts().git.places[left]).toBeUndefined();

    expect(harness.published.some((facts) => Object.hasOwn(facts.git.places, left))).toBe(false);
  });

  test('keeps an invalidated read in the dispatch limit until it settles', async () => {
    const folders = ['/code/a', '/code/b', '/code/c', '/code/d', '/code/e'];

    for (const folder of folders) {
      harness.setFolder(null, folder, mainCheckout(folder));
    }

    const scheduler = harness.start();
    const spaces = folders.map((folder, index) => spaceOf(`s${index}`, folder));

    scheduler.tick(worldOf(spaces), harness.context);
    expect(harness.started).toHaveLength(4);

    scheduler.tick(worldOf(spaces.slice(1)), harness.context);
    expect(harness.started).toHaveLength(4);

    await harness.complete(harness.startedAt(0));
    expect(harness.started).toHaveLength(4);

    scheduler.tick(worldOf(spaces.slice(1)), harness.context);
    expect(harness.started).toHaveLength(5);
    expect(harness.startedAt(4).folder).toBe('/code/e');
  });

  test('drops a result after a place leaves and returns', async () => {
    harness.setFolder(null, '/code/a', mainCheckout('/code/a'));
    harness.setFolder(null, '/code/b', mainCheckout('/code/b'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/a')]), harness.context);
    expect(harness.started).toHaveLength(1);

    scheduler.tick(worldOf([spaceOf('s1', '/code/b')]), harness.context);
    expect(harness.started).toHaveLength(2);

    scheduler.tick(worldOf([spaceOf('s1', '/code/a')]), harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setFolder(null, '/code/a', { ...mainCheckout('/code/a'), branch: 'old\n' });
    await harness.complete(harness.startedAt(0));

    expect(scheduler.facts().git.places[placeKeyOf(null, '/code/a')]).toBeUndefined();
    expect(harness.published.some(hasOldBranch)).toBe(false);

    scheduler.tick(worldOf([spaceOf('s1', '/code/a')]), harness.context);
    expect(harness.started).toHaveLength(3);
    expect(harness.startedAt(2).folder).toBe('/code/a');

    harness.setFolder(null, '/code/a', { ...mainCheckout('/code/a'), branch: 'fresh\n' });
    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts().git.worktrees[worktreeOf(null, '/code/a').key]?.branch).toBe('fresh');
  });

  test('stop cancels the watch and drops a late result', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.watches.at(-1)?.cancelled).toBe(false);

    harness.setNow(10);
    await harness.fire();
    scheduler.tick(world, harness.context);

    harness.setNow(260);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    scheduler.stop();
    await harness.settle();
    expect(harness.watches.at(-1)?.cancelled).toBe(true);

    const revisionBefore = harness.revision();
    const publishedBefore = harness.published.length;
    const watchedBefore = harness.watched.length;

    harness.setFolder(null, '/code/koja', { ...mainCheckout('/code/koja'), branch: 'other\n' });
    await harness.complete(harness.startedAt(1));

    expect(harness.published).toHaveLength(publishedBefore);
    expect(harness.revision()).toBe(revisionBefore);
    expect(harness.watched).toHaveLength(watchedBefore);

    expect(scheduler.facts().git.worktrees[worktreeOf(null, '/code/koja').key]?.branch).toBe(
      'main',
    );
  });
});
