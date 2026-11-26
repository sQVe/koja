import { beforeEach, describe, expect, test } from 'bun:test';

import { keyOf } from '../../tests/gitKey.ts';
import {
  GitSchedulerHarness,
  mainCheckout,
  spaceOf,
  worldOf,
} from '../../tests/gitSchedulerHarness.ts';
import { worktreeOf } from './gitIdentity.ts';

const harness = new GitSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createGitScheduler', () => {
  test('reads a burst of watch events once per debounce window', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    await harness.complete(harness.startedAt(0));
    expect(harness.revision()).toBe(1);
    expect(harness.watched).toEqual(['/code/koja/.git']);

    for (const at of [0, 50, 100, 150, 200]) {
      harness.setNow(at);
      await harness.fire();
    }

    harness.setNow(200);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    harness.setNow(250);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setNow(300);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));
    expect(harness.published).toHaveLength(2);
    expect(harness.revision()).toBe(1);
  });

  test('drops a late result for a place the space left', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));
    harness.setFolder(null, '/code/tikk', mainCheckout('/code/tikk'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/koja')]), harness.context);
    expect(harness.started).toHaveLength(1);

    scheduler.tick(worldOf([spaceOf('s1', '/code/tikk')]), harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(0));

    const left = keyOf(null, '/code/koja');

    expect(harness.watched).toEqual([]);

    expect(scheduler.gitFacts().places[left]).toBeUndefined();

    expect(harness.published.some((facts) => Object.hasOwn(facts.places, left))).toBe(false);

    await harness.complete(harness.startedAt(1));

    expect(harness.watched).toEqual(['/code/tikk/.git']);

    expect(scheduler.gitFacts().places[keyOf(null, '/code/tikk')]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(null, '/code/tikk').key,
    });
  });

  test('keeps the last good fact when a read fails', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.revision()).toBe(1);

    harness.setNow(10);
    await harness.fire();
    scheduler.tick(world, harness.context);

    harness.setNow(260);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    harness.failure = 'fatal: the machine is unreachable';
    await harness.complete(harness.startedAt(1));

    expect(scheduler.gitFacts().places[keyOf(null, '/code/koja')]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(null, '/code/koja').key,
    });

    expect(harness.revision()).toBe(1);
  });

  test('keeps the last good fact when a layout flag is neither true nor false', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.revision()).toBe(1);

    const replies = ['yes\nfalse\n', 'false\nyes\n'];

    for (const [index, flags] of replies.entries()) {
      const other = `/code/other-${index}`;

      harness.setFolder(null, '/code/koja', {
        layout: `${flags}${other}/.git\n${other}/.git\n`,
        top: other,
        branch: 'other\n',
      });

      harness.setNow(10 + index * 300);
      await harness.fire();
      scheduler.tick(world, harness.context);

      harness.setNow(260 + index * 300);
      scheduler.tick(world, harness.context);
      expect(harness.started).toHaveLength(2 + index);

      await harness.complete(harness.startedAt(1 + index));

      expect(scheduler.gitFacts().places[keyOf(null, '/code/koja')]).toEqual({
        kind: 'repository',
        worktree: worktreeOf(null, '/code/koja').key,
      });

      expect(harness.revision()).toBe(1);
    }
  });

  test('publishes a failed place and reads it again after the fallback', async () => {
    harness.failure = 'fatal: the machine is unreachable';

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));

    const key = keyOf(null, '/code/koja');

    expect(harness.published.at(-1)?.places[key]).toEqual({ kind: 'failed' });
    expect(harness.revision()).toBe(1);

    harness.setNow(60_000);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    harness.setNow(60_001);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);
  });

  test('reads a remote place with no watch', async () => {
    harness.setFolder('qa-remote', '/srv/app', mainCheckout('/srv/app'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/srv/app', 'qa-remote')]), harness.context);
    await harness.complete(harness.startedAt(0));

    expect(harness.watched).toEqual([]);

    expect(scheduler.gitFacts().places[keyOf('qa-remote', '/srv/app')]).toEqual({
      kind: 'repository',
      worktree: worktreeOf('qa-remote', '/srv/app').key,
    });
  });

  test('reads again after 60 seconds while the window is inactive', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(60_000);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    harness.setNow(60_001);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);
  });

  test('reads a folder with no repository again after the fallback', async () => {
    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/plain')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));

    const key = keyOf(null, '/code/plain');

    expect(harness.published.at(-1)?.places[key]).toEqual({ kind: 'none' });
    expect(harness.watched).toEqual([]);

    harness.setNow(60_000);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(1);

    harness.setNow(60_001);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);
  });

  test('starts a new watch after the folder watch fails', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.watched).toHaveLength(1);

    harness.watches.at(-1)?.reject(new Error('too many folders'));
    await harness.settle();

    harness.setNow(60_001);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(1));
    expect(harness.watched).toHaveLength(2);
  });

  test('cancels the watch when the last space leaves and starts no read', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();
    const world = worldOf([spaceOf('s1', '/code/koja')]);

    scheduler.tick(world, harness.context);
    await harness.complete(harness.startedAt(0));

    const watch = harness.watches.at(-1);

    scheduler.tick(worldOf([]), harness.context);

    expect(watch?.cancelled).toBe(true);
    expect(harness.started).toHaveLength(1);

    harness.setNow(1);
    scheduler.tick(worldOf([]), harness.context);

    expect(harness.started).toHaveLength(1);
  });

  test('publishes the removal of a worktree after its last place leaves', async () => {
    harness.setFolder(null, '/code/koja', mainCheckout('/code/koja'));

    const scheduler = harness.start();

    scheduler.tick(worldOf([spaceOf('s1', '/code/koja')]), harness.context);
    await harness.complete(harness.startedAt(0));
    expect(harness.revision()).toBe(1);

    scheduler.tick(worldOf([]), harness.context);

    const published = harness.published.at(-1);

    expect(harness.revision()).toBe(2);
    expect(published?.places).toEqual({});
    expect(published?.worktrees).toEqual({});
  });
});
