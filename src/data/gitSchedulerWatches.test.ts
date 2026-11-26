import { beforeEach, describe, expect, test } from 'bun:test';

import {
  GitSchedulerHarness,
  mainCheckout,
  spaceOf,
  worldOf,
} from '../../tests/gitSchedulerHarness.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';

const harness = new GitSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createGitScheduler watches', () => {
  test('keeps a pending watch refresh for a different live representative', async () => {
    harness.setFolder(null, '/code/a', mainCheckout('/code/a'));
    harness.setFolder(null, '/code/a/sub', mainCheckout('/code/a'));

    const scheduler = harness.start();
    const both = worldOf([spaceOf('s1', '/code/a'), spaceOf('s2', '/code/a/sub')]);
    const subOnly = worldOf([spaceOf('s2', '/code/a/sub')]);

    scheduler.tick(worldOf([spaceOf('s1', '/code/a')]), harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.watched).toEqual(['/code/a/.git']);

    scheduler.tick(both, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));

    harness.setNow(1);
    await harness.fire();
    harness.setNow(2);
    scheduler.tick(both, harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setNow(100);
    scheduler.tick(subOnly, harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setNow(251);
    scheduler.tick(subOnly, harness.context);
    expect(harness.started).toHaveLength(3);
    expect(harness.startedAt(2).folder).toBe('/code/a/sub');
    expect(harness.started.filter((read) => read.folder === '/code/a')).toHaveLength(1);
  });

  test('starts no watch for a bare repository', async () => {
    harness.setFolder(null, '/code/bare.git', {
      layout: 'true\nfalse\n/code/bare.git\n/code/bare.git\n',
      branch: 'main\n',
    });

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/bare.git')]), harness.context);
    await harness.complete(harness.startedAt(0));

    expect(harness.watched).toEqual([]);

    expect(scheduler.gitFacts().places[placeOf(null, '/code/bare.git').key]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(null, '/code/bare.git').key,
    });
  });

  test('records a bare place in the .bare layout as bare', async () => {
    harness.setFolder(null, '/code/project', {
      layout: 'true\nfalse\n/code/project/.bare\n/code/project/.bare\n',
      branch: 'main\n',
    });

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/project')]), harness.context);
    await harness.complete(harness.startedAt(0));

    expect(scheduler.gitFacts().worktrees[worktreeOf(null, '/code/project').key]).toEqual({
      repository: repositoryOf(null, '/code/project/.bare'),
      root: '/code/project',
      branch: 'main',
      linked: false,
      bare: true,
    });
  });

  test('forgets a repository and cancels its watch when a refresh finds none', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));

    const watch = harness.watches.at(-1);
    const key = placeOf(null, '/code/koja').key;

    expect(scheduler.gitFacts().places[key]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(null, '/code/koja').key,
    });

    expect(watch?.cancelled).toBe(false);

    harness.clearFolder(null, '/code/koja');
    harness.setNow(60_001);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));

    expect(scheduler.gitFacts().places[key]).toEqual({ kind: 'none' });
    expect(scheduler.gitFacts().worktrees).toEqual({});
    expect(watch?.cancelled).toBe(true);
  });

  test('cancels the checkout watch when only a bare place remains', async () => {
    harness.setFolder(null, '/code/bare.git', {
      layout: 'true\nfalse\n/code/common.git\n/code/common.git\n',
      branch: 'main\n',
    });

    harness.setFolder(null, '/code/work', {
      layout: 'false\nfalse\n/code/common.git/worktrees/work\n/code/common.git\n',
      top: '/code/work',
      branch: 'work\n',
    });

    const scheduler = harness.start();
    const both = worldOf([spaceOf('s1', '/code/work'), spaceOf('s2', '/code/bare.git')]);

    scheduler.tick(both, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));
    expect(harness.watched).toEqual(['/code/common.git']);
    expect(harness.watches.at(-1)?.cancelled).toBe(false);

    await harness.complete(harness.startedAt(0));
    expect(harness.watches.at(-1)?.cancelled).toBe(false);

    scheduler.tick(worldOf([spaceOf('s2', '/code/bare.git')]), harness.context);

    expect(harness.watches.at(-1)?.cancelled).toBe(true);
    expect(scheduler.gitFacts().places[placeOf(null, '/code/bare.git').key]).toBeDefined();
  });

  test('reads once when a smaller representative becomes known during the debounce', async () => {
    harness.setFolder(null, '/code/a', mainCheckout('/code/a'));
    harness.setFolder(null, '/code/a/sub', mainCheckout('/code/a'));

    const scheduler = harness.start();
    const root = spaceOf('root', '/code/a');
    const sub = spaceOf('sub', '/code/a/sub');

    scheduler.tick(worldOf([sub]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(1);
    await harness.fire();
    harness.setNow(2);
    scheduler.tick(worldOf([sub]), harness.context);

    harness.setNow(100);
    scheduler.tick(worldOf([root, sub]), harness.context);
    await harness.complete(harness.startedAt(1));

    harness.setNow(250);
    scheduler.tick(worldOf([root, sub]), harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setNow(251);
    scheduler.tick(worldOf([root, sub]), harness.context);
    expect(harness.started).toHaveLength(3);
    expect(harness.startedAt(2).folder).toBe('/code/a');

    await harness.complete(harness.startedAt(2));
    harness.setNow(252);
    scheduler.tick(worldOf([root, sub]), harness.context);
    expect(harness.started).toHaveLength(3);
  });

  test('cancels the checkout watch after the last linked checkout leaves a bare place', async () => {
    harness.setFolder(null, '/code/repo', mainCheckout('/code/repo'));

    const scheduler = harness.start();
    const repo = spaceOf('repo', '/code/repo');
    const linked = spaceOf('linked', '/code/checkout');

    scheduler.tick(worldOf([repo]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setFolder(null, '/code/repo', {
      layout: 'true\nfalse\n/code/repo\n/code/repo\n',
      branch: 'main\n',
    });

    harness.setNow(1);
    await harness.fire();

    const checkoutWatch = harness.watches.at(-1);

    harness.setNow(251);
    scheduler.tick(worldOf([repo]), harness.context);
    await harness.complete(harness.startedAt(1));

    expect(checkoutWatch?.cancelled).toBe(true);

    harness.setFolder(null, '/code/checkout', {
      layout: 'false\nfalse\n/code/repo/worktrees/checkout\n/code/repo\n',
      top: '/code/checkout',
      branch: 'work\n',
    });

    scheduler.tick(worldOf([repo, linked]), harness.context);
    await harness.complete(harness.startedAt(2));

    const linkedWatch = harness.watches.at(-1);
    const bare = placeOf(null, '/code/repo').key;

    expect(scheduler.gitFacts().places[bare]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(null, '/code/repo').key,
    });

    scheduler.tick(worldOf([repo]), harness.context);

    expect(checkoutWatch?.cancelled).toBe(true);
    expect(linkedWatch?.cancelled).toBe(true);
  });
});
