import { beforeEach, describe, expect, test } from 'bun:test';

import {
  GitSchedulerHarness,
  mainCheckout,
  placeKeyOf,
  spaceOf,
  terminal,
  worldOf,
} from '../../tests/gitSchedulerHarness.ts';
import { repositoryOf, worktreeOf } from './gitIdentity.ts';

const harness = new GitSchedulerHarness();

const rootFolder = '/code/a';
const aliasFolder = '/code/a/sub';
const extraFolder = '/code/a/n';

const sharedWorktree = worktreeOf(null, rootFolder).key;

const root = spaceOf('root', rootFolder);
const alias = spaceOf('alias', aliasFolder);

const aliasReads = () => harness.started.filter((read) => read.folder === aliasFolder);

const linkedCheckout = (repositoryRoot: string, name: string, top: string, branch: string) => ({
  layout: `false\nfalse\n${repositoryRoot}/.git/worktrees/${name}\n${repositoryRoot}/.git\n`,
  top,
  branch: `${branch}\n`,
});

beforeEach(() => {
  harness.reset();
});

describe('createGitScheduler place mapping fallback', () => {
  test('rechecks a stale nested remote alias and corrects its mapping', async () => {
    const remote = 'qa-remote';
    const remoteRoot = '/srv/app';
    const remoteAlias = '/srv/app/sub';

    harness.setFolder(remote, remoteRoot, mainCheckout(remoteRoot));
    harness.setFolder(remote, remoteAlias, mainCheckout(remoteRoot));

    const scheduler = harness.start();

    const world = worldOf([
      spaceOf('root', remoteRoot, remote),
      spaceOf('alias', remoteAlias, remote),
    ]);

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    await harness.complete(harness.startedAt(0));
    await harness.complete(harness.startedAt(1));

    const rootKey = placeKeyOf(remote, remoteRoot);
    const aliasKey = placeKeyOf(remote, remoteAlias);
    const shared = worktreeOf(remote, remoteRoot).key;

    expect(scheduler.facts().git.places[rootKey]).toEqual({
      kind: 'repository',
      worktree: shared,
    });

    expect(scheduler.facts().git.places[aliasKey]).toEqual({
      kind: 'repository',
      worktree: shared,
    });

    harness.setNow(60_000);
    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(2);

    harness.setFolder(remote, remoteAlias, mainCheckout(remoteAlias));
    harness.setNow(60_001);
    scheduler.tick(world, harness.context);

    expect(harness.started).toHaveLength(3);
    expect(harness.startedAt(2).folder).toBe(remoteRoot);

    await harness.complete(harness.startedAt(2));
    scheduler.tick(world, harness.context);

    expect(harness.started).toHaveLength(4);
    expect(harness.startedAt(3).folder).toBe(remoteAlias);

    await harness.complete(harness.startedAt(3));

    expect(scheduler.facts().git.places[rootKey]).toEqual({
      kind: 'repository',
      worktree: shared,
    });

    expect(scheduler.facts().git.places[aliasKey]).toEqual({
      kind: 'repository',
      worktree: worktreeOf(remote, remoteAlias).key,
    });
  });

  test('moves an idle alias to a linked worktree of the same repository', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([alias]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(30_000);
    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(1));

    const aliasKey = placeKeyOf(null, aliasFolder);
    const linkedWorktree = worktreeOf(null, aliasFolder).key;
    const revisionBefore = harness.revision();

    harness.setFolder(null, aliasFolder, linkedCheckout(rootFolder, 'sub', aliasFolder, 'feature'));

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(harness.startedAt(2).folder).toBe(aliasFolder);

    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts().git.places[aliasKey]).toEqual({
      kind: 'repository',
      worktree: linkedWorktree,
    });

    expect(scheduler.facts().git.worktrees[linkedWorktree]).toEqual({
      repository: repositoryOf(null, `${rootFolder}/.git`),
      root: aliasFolder,
      branch: 'feature',
      linked: true,
    });

    expect(harness.revision()).toBe(revisionBefore + 1);
  });

  test('replaces a same-root alias mapping when its checkout joins another repository', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([alias]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(30_000);
    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(1));

    const aliasKey = placeKeyOf(null, aliasFolder);
    const revisionBefore = harness.revision();

    harness.setFolder(null, aliasFolder, linkedCheckout('/code/other', 'a', rootFolder, 'release'));

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(harness.startedAt(2).folder).toBe(aliasFolder);

    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts().git.places[aliasKey]).toEqual({
      kind: 'repository',
      worktree: sharedWorktree,
    });

    expect(scheduler.facts().git.worktrees[sharedWorktree]).toEqual({
      repository: repositoryOf(null, '/code/other/.git'),
      root: rootFolder,
      branch: 'release',
      linked: true,
    });

    expect(harness.revision()).toBe(revisionBefore + 1);
  });

  test('refreshes a blocked alias recheck when a pane finishes before dispatch', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(0));
    await harness.complete(harness.startedAt(1));

    const working = terminal('p1', 'tab-root', 'working');
    const idle = terminal('p1', 'tab-root', null);

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias], [working]), harness.context);
    expect(harness.startedAt(2).folder).toBe(rootFolder);
    expect(harness.started).toHaveLength(3);

    harness.setNow(60_002);
    scheduler.tick(worldOf([root, alias], [idle]), harness.context);
    expect(harness.started).toHaveLength(3);

    await harness.complete(harness.startedAt(2));

    harness.setFolder(null, rootFolder, { ...mainCheckout(rootFolder), branch: 'feature\n' });
    harness.setFolder(null, aliasFolder, { ...mainCheckout(rootFolder), branch: 'feature\n' });

    const aliasKey = placeKeyOf(null, aliasFolder);
    const mappingBefore = structuredClone(scheduler.facts().git.places[aliasKey]);
    const revisionBefore = harness.revision();
    const publishedBefore = harness.published.length;

    harness.setNow(60_003);
    scheduler.tick(worldOf([root, alias], [idle]), harness.context);
    expect(harness.startedAt(3).folder).toBe(aliasFolder);

    await harness.complete(harness.startedAt(3));

    expect(scheduler.facts().git.places[aliasKey]).toEqual(mappingBefore);

    expect(scheduler.facts().git.worktrees[sharedWorktree]).toEqual({
      repository: repositoryOf(null, `${rootFolder}/.git`),
      root: rootFolder,
      branch: 'feature',
      linked: false,
    });

    expect(harness.published).toHaveLength(publishedBefore + 1);
    expect(harness.revision()).toBe(revisionBefore + 1);
  });

  test('updates only the read time when a stale alias still maps to the same repository', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([alias]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(30_000);
    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(1));

    const factsBefore = structuredClone(scheduler.facts());
    const revisionBefore = harness.revision();

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(aliasReads()).toHaveLength(2);

    const publishedBefore = harness.published.length;

    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts()).toEqual(factsBefore);
    expect(harness.revision()).toBe(revisionBefore);
    expect(harness.published).toHaveLength(publishedBefore);

    harness.setNow(120_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(aliasReads()).toHaveLength(2);

    await harness.complete(harness.startedAt(3));

    harness.setNow(120_002);
    scheduler.tick(worldOf([root, alias]), harness.context);

    expect(harness.started).toHaveLength(5);
    expect(harness.startedAt(4).folder).toBe(aliasFolder);
  });

  test('keeps a pending watch mark and the worktree fence after an unchanged alias recheck', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([alias]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(30_000);
    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(1));

    harness.setFolder(null, extraFolder, mainCheckout(rootFolder));
    harness.setNow(60_001);
    await harness.fire();

    const world = worldOf([root, alias, spaceOf('extra', extraFolder)]);

    scheduler.tick(world, harness.context);
    expect(harness.started).toHaveLength(4);
    expect(harness.startedAt(2).folder).toBe(extraFolder);
    expect(harness.startedAt(3).folder).toBe(aliasFolder);

    const factsBefore = structuredClone(scheduler.facts());
    const revisionBefore = harness.revision();
    const publishedBefore = harness.published.length;

    await harness.complete(harness.startedAt(3));

    expect(scheduler.facts()).toEqual(factsBefore);
    expect(harness.revision()).toBe(revisionBefore);
    expect(harness.published).toHaveLength(publishedBefore);

    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts().git.places[placeKeyOf(null, extraFolder)]).toEqual({
      kind: 'repository',
      worktree: sharedWorktree,
    });

    harness.setNow(60_251);
    scheduler.tick(world, harness.context);

    expect(harness.started).toHaveLength(5);
    expect(harness.startedAt(4).folder).toBe(rootFolder);
  });

  test('applies a none mapping through the existing facts path', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(0));
    await harness.complete(harness.startedAt(1));

    const aliasKey = placeKeyOf(null, aliasFolder);
    const revisionBefore = harness.revision();

    harness.setFolder(null, aliasFolder, {
      layout: `false\ntrue\n${rootFolder}/.git\n${rootFolder}/.git\n`,
    });

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(harness.startedAt(2).folder).toBe(rootFolder);

    await harness.complete(harness.startedAt(2));
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(harness.startedAt(3).folder).toBe(aliasFolder);

    await harness.complete(harness.startedAt(3));

    expect(scheduler.facts().git.places[aliasKey]).toEqual({ kind: 'none' });
    expect(harness.revision()).toBe(revisionBefore + 1);
  });

  test('keeps last good facts and retries after a failed alias recheck', async () => {
    harness.setFolder(null, rootFolder, mainCheckout(rootFolder));
    harness.setFolder(null, aliasFolder, mainCheckout(rootFolder));

    const scheduler = harness.start();

    scheduler.tick(worldOf([alias]), harness.context);
    await harness.complete(harness.startedAt(0));

    harness.setNow(30_000);
    scheduler.tick(worldOf([root, alias]), harness.context);
    await harness.complete(harness.startedAt(1));

    harness.setNow(60_001);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(aliasReads()).toHaveLength(2);

    const factsBefore = structuredClone(scheduler.facts());
    const revisionBefore = harness.revision();

    harness.failure = 'fatal: the machine is unreachable';
    await harness.complete(harness.startedAt(2));

    expect(scheduler.facts()).toEqual(factsBefore);
    expect(harness.revision()).toBe(revisionBefore);

    harness.failure = null;
    harness.setNow(120_002);
    scheduler.tick(worldOf([root, alias]), harness.context);
    expect(harness.startedAt(3).folder).toBe(rootFolder);

    await harness.complete(harness.startedAt(3));
    scheduler.tick(worldOf([root, alias]), harness.context);

    expect(harness.started).toHaveLength(5);
    expect(harness.startedAt(4).folder).toBe(aliasFolder);
  });
});
