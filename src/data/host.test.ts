import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import {
  folder,
  pullPeriodMilliseconds,
  pushGapMilliseconds,
  repository,
  setupDataHost,
  start,
  sweepMilliseconds,
} from '../../tests/dataHostHarness.ts';
import { runSnapshotNoticeScenario } from '../../tests/snapshotNoticeLifetime.ts';
import { worktreeOf } from './gitIdentity.ts';
import {
  heartbeatIntervalMilliseconds,
  heartbeatKey,
  leaseExpiryMilliseconds,
  leaseKey,
} from './lease.ts';
import { pullReadTimesKey } from './pullReadTimes.ts';
import { pullRetryRequestsKey } from './pullRetry/pullRetry.ts';
import type { TicketFacts } from './snapshot.ts';
import { emptyFacts, parseSnapshot, snapshotKey } from './snapshot.ts';

const dataHost = await setupDataHost();

afterAll(() => {
  mock.restore();
  setSystemTime();
});

beforeEach(() => {
  dataHost.reset();
});

describe('startDataHost', () => {
  test('claims generation 1 and publishes revision 1 of the empty snapshot at once', () => {
    dataHost.startCopy();

    expect(dataHost.heartbeat()).toMatchObject({ generation: 1, at: start });

    expect(dataHost.sharedValues.get(snapshotKey)).toEqual({
      version: 8,
      revision: 1,
      facts: emptyFacts(),
    });
  });

  test('renews the heartbeat on its timer every heartbeat interval', () => {
    const copy = dataHost.startCopy();
    const renewedAt = start + heartbeatIntervalMilliseconds;

    setSystemTime(renewedAt);
    copy.beat();

    expect(dataHost.intervals).toEqual([heartbeatIntervalMilliseconds, sweepMilliseconds]);
    expect(dataHost.heartbeat()).toMatchObject({ generation: 1, at: renewedAt });
  });

  test('gives each copy its own owner', () => {
    dataHost.startCopy();
    const first = dataHost.heartbeat()?.owner;

    dataHost.sharedValues.clear();
    dataHost.startCopy();

    expect(dataHost.heartbeat()?.owner).not.toBe(first);
  });

  test('leaves a live owner in place when a second copy starts', () => {
    dataHost.startCopy();
    const first = dataHost.heartbeat();

    setSystemTime(start + heartbeatIntervalMilliseconds);
    dataHost.startCopy();

    expect(dataHost.heartbeat()).toEqual(first);
  });

  test('lets a second copy take over with the next generation after the first stops renewing', () => {
    dataHost.startCopy();
    const first = dataHost.heartbeat()?.owner;
    const second = dataHost.startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry - 1);
    second.beat();

    expect(dataHost.heartbeat()?.owner).toBe(first);

    setSystemTime(expiry);
    second.beat();

    expect(dataHost.heartbeat()).toMatchObject({ generation: 2, at: expiry });
    expect(dataHost.heartbeat()?.owner).not.toBe(first);
  });

  test('stops renewing in a copy whose lease was taken over', () => {
    const first = dataHost.startCopy();
    const second = dataHost.startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry);
    second.beat();
    const taken = dataHost.heartbeat();

    setSystemTime(expiry + 1);
    first.beat();

    expect(dataHost.heartbeat()).toEqual(taken);
  });

  test('starts no git read in a copy that does not hold the lease', () => {
    dataHost.sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 1 });

    dataHost.sharedValues.set(heartbeatKey, {
      version: 1,
      owner: 'other',
      generation: 1,
      at: start,
    });

    const copy = dataHost.startCopy();

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(dataHost.gitCalls()).toEqual([]);
  });

  test('reads git in the copy that holds the lease', async () => {
    const copy = dataHost.startCopy();

    copy.beat();
    copy.tick();
    await dataHost.settle();

    const read = dataHost
      .gitCalls()
      .some((call) => call.args[0] === 'rev-parse' && call.cwd === folder);

    expect(read).toBe(true);
  });

  test('a remote-ref watch starts a pull read before the 60 s period', async () => {
    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    expect(dataHost.pullCalls()).toHaveLength(1);

    const repoWatches = dataHost.watches.filter((watched) => watched.folder === `${folder}/.git`);

    expect(repoWatches.length).toBeGreaterThan(0);

    setSystemTime(start + 10_000);

    for (const watch of repoWatches) {
      watch.resolve([`${folder}/.git/refs/remotes/origin/main`]);
    }

    await dataHost.settle();

    // The watch event at 10 s makes the push read due one push gap after the last read start,
    // well before the 60 s period.
    const tickAt = start + pushGapMilliseconds;

    for (
      let at = start + heartbeatIntervalMilliseconds;
      at < tickAt;
      at += heartbeatIntervalMilliseconds
    ) {
      setSystemTime(at);
      copy.beat();
    }

    setSystemTime(tickAt);
    copy.tick();
    await dataHost.settle();

    expect(dataHost.pullCalls()).toHaveLength(2);
  });

  test('starts from the stored facts when it takes over', () => {
    dataHost.sharedValues.set(snapshotKey, dataHost.storedSnapshot());
    dataHost.sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 1 });

    dataHost.sharedValues.set(heartbeatKey, {
      version: 1,
      owner: 'other',
      generation: 1,
      at: start - leaseExpiryMilliseconds,
    });

    const copy = dataHost.startCopy();

    copy.beat();

    expect(parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.revision).toBe(7);
  });

  test('a takeover seeds the PR facts and a recent read time so it starts no read', async () => {
    const pull = dataHost.readPull(7);

    dataHost.sharedValues.set(
      snapshotKey,
      dataHost.storedSnapshot({ [repository.key]: { pulls: [pull], failed: false } }),
    );

    dataHost.sharedValues.set(pullReadTimesKey, {
      version: 1,
      pulls: { [repository.key]: start - 1000 },
    });

    dataHost.sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 1 });

    dataHost.sharedValues.set(heartbeatKey, {
      version: 1,
      owner: 'other',
      generation: 1,
      at: start - leaseExpiryMilliseconds,
    });

    const copy = dataHost.startCopy();

    copy.beat();
    copy.tick();
    await dataHost.settle();

    expect(dataHost.pullCalls()).toEqual([]);

    expect(
      parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.facts.pulls[repository.key],
    ).toEqual({
      pulls: [pull],
      failed: false,
    });
  });

  test('a successful Retry clears the failed state and repopulates the titles', async () => {
    const pull = dataHost.readPull(7);

    dataHost.pullList = [pull];
    dataHost.ghFailures = 1;

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    expect(
      parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.facts.pulls[repository.key],
    ).toEqual({
      pulls: [],
      failed: true,
    });

    dataHost.sharedValues.set(pullRetryRequestsKey, {
      version: 1,
      requests: [{ consumer: 'window-a', id: 'r-1', repository: repository.key, at: start }],
    });

    copy.tick();
    await dataHost.settle();

    expect(
      parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.facts.pulls[repository.key],
    ).toEqual({
      pulls: [pull],
      failed: false,
    });
  });

  test('stops reading after it loses the lease', async () => {
    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();

    const before = dataHost.gitCalls().length;

    expect(before).toBeGreaterThan(0);
    expect(dataHost.watches).toHaveLength(1);

    dataHost.sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 2 });

    dataHost.sharedValues.set(heartbeatKey, {
      version: 1,
      owner: 'other',
      generation: 2,
      at: start,
    });

    dataHost.spaceFolders = [folder, '/code/tikk'];

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(dataHost.gitCalls()).toHaveLength(before);
    expect(dataHost.watches.at(-1)?.cancelled).toBe(true);
  });

  test('starts no git read while Herdr checks the mods', () => {
    dataHost.checkingNow = true;

    const copy = dataHost.startCopy();

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(dataHost.intervals).toEqual([heartbeatIntervalMilliseconds]);
    expect(dataHost.gitCalls()).toEqual([]);
  });

  test('logs one notice per reason across the reader, the host seed and the publisher', async () => {
    const record = await runSnapshotNoticeScenario('host-once-per-reason');
    const snapshotWrites = record.writes.filter((write) => write.key === snapshotKey);

    expect(record.messages).toHaveLength(2);
    expect(record.stages.map((stage) => stage.messageCount)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(snapshotWrites).toHaveLength(2);
    expect(snapshotWrites.map((write) => write.messageCount)).toEqual([1, 2]);
    expect(record.snapshot).toEqual({ version: 8, revision: 1, facts: emptyFacts() });
  });

  test('logs again in a fresh loaded copy', async () => {
    const first = await runSnapshotNoticeScenario('host-once-per-reason');
    const second = await runSnapshotNoticeScenario('host-once-per-reason');

    expect(first.messages).toHaveLength(2);
    expect(second.messages).toHaveLength(2);
    expect(second.stages.map((stage) => stage.messageCount)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  test('an unchanged PR read writes no new snapshot revision', async () => {
    const pull = dataHost.readPull(7);

    dataHost.pullList = [pull];

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    const afterRead = parseSnapshot(dataHost.sharedValues.get(snapshotKey));

    expect(afterRead?.facts.pulls[repository.key]).toEqual({ pulls: [pull], failed: false });

    const revision = afterRead?.revision;

    setSystemTime(start + pullPeriodMilliseconds);
    copy.beat();
    copy.tick();
    await dataHost.settle();

    expect(parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.revision).toBe(revision);

    const readTime = start + pullPeriodMilliseconds;

    expect(dataHost.sharedValues.get(pullReadTimesKey)).toEqual({
      version: 2,
      repositories: {
        [repository.key]: { list: readTime, checks: { '7': readTime }, threads: { '7': readTime } },
      },
    });

    expect(dataHost.pullCalls()).toHaveLength(2);
  });

  test('PR facts and git facts publish in one snapshot', async () => {
    const pull = dataHost.readPull(7);

    dataHost.pullList = [pull];

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    const worktree = worktreeOf(null, folder).key;
    const open = parseSnapshot(dataHost.sharedValues.get(snapshotKey));

    expect(open?.facts.git.worktrees[worktree]).toBeDefined();
    expect(open?.facts.pulls[repository.key]).toEqual({ pulls: [pull], failed: false });

    dataHost.spaceFolders = [];
    copy.tick();
    await dataHost.settle();

    const closed = parseSnapshot(dataHost.sharedValues.get(snapshotKey));

    expect(closed?.facts.git.worktrees).toEqual({});
    expect(closed?.facts.pulls).toEqual({});

    const reads = dataHost.pullCalls().length;

    dataHost.spaceFolders = [folder];
    copy.tick();
    await dataHost.settle();

    const reopened = parseSnapshot(dataHost.sharedValues.get(snapshotKey));

    expect(reopened?.facts.git.worktrees[worktree]).toBeDefined();
    expect(reopened?.facts.pulls[repository.key]).toEqual({ pulls: [pull], failed: false });
    expect(dataHost.pullCalls()).toHaveLength(reads);
  });

  test('publishes the tracker facts with the snapshot', async () => {
    const facts: TicketFacts = {
      id: 'ME-1036',
      title: 'Title spaces with their Linear tickets',
      state: 'In Progress',
      url: 'https://linear.app/sqve/issue/ME-1036',
      parent: null,
    };

    dataHost.gitBranch = 'me-1036-title-spaces-with-their-linear-tickets';
    dataHost.linearTickets = { 'ME-1036': facts };

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    expect(
      parseSnapshot(dataHost.sharedValues.get(snapshotKey))?.facts.trackers[repository.key],
    ).toEqual({
      workspace: 'sqve',
      tickets: { 'ME-1036': facts },
      failed: false,
    });
  });

  test('a git-only facts change keeps the PR facts already read', async () => {
    const pull = dataHost.readPull(7);

    dataHost.pullList = [pull];

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    dataHost.spaceFolders = [folder, '/code/tikk'];
    copy.tick();
    await dataHost.settle();

    const after = parseSnapshot(dataHost.sharedValues.get(snapshotKey));
    const added = worktreeOf(null, '/code/tikk').key;

    expect(after?.facts.git.worktrees[added]).toBeDefined();
    expect(after?.facts.pulls[repository.key]).toEqual({ pulls: [pull], failed: false });
  });
});
