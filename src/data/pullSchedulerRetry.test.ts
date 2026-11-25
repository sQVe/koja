import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import type { RunCommand } from './gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Lease } from './lease.ts';
import { heartbeatKey, leaseKey } from './lease.ts';
import { pullRetryRequestsKey } from './pullRetry.ts';
import type { PullScheduler, PullSchedulerSeed } from './pullScheduler.ts';
import { createPullScheduler } from './pullScheduler.ts';
import type { RecordNotices } from './recordNotices.ts';
import type { GitFacts } from './snapshot.ts';

interface PendingCall {
  command: string;
  args: string[];
  cwd: string;
  respond: (result: ExecResult) => void;
}

const start = 1_000_000;

const silentNotices: RecordNotices = { report: () => undefined };

const folders = ['/code/a', '/code/b', '/code/c'];

const factsOf = (): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const folder of folders) {
    const place = placeOf(null, folder);
    const worktree = worktreeOf(null, folder);

    places[place.key] = { kind: 'repository', worktree: worktree.key };

    worktrees[worktree.key] = {
      repository: repositoryOf(null, `${folder}/.git`),
      root: folder,
      branch: 'main',
      linked: false,
    };
  }

  return { places, worktrees };
};

class RetryHarness {
  values = new Map<string, unknown>();
  calls: PendingCall[] = [];
  spawned: Promise<unknown>[] = [];
  now = start;
  lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };

  readonly read = (key: string): unknown => this.values.get(key);

  readonly write = (key: string, value: unknown): void => {
    this.values.set(key, structuredClone(value));
  };

  readonly run: RunCommand = async (command, args, options) => {
    const settled = Promise.withResolvers<ExecResult>();

    this.calls.push({ command, args, cwd: options.cwd, respond: settled.resolve });

    return settled.promise;
  };

  readonly spawn = (body: () => Promise<void>): void => {
    this.spawned.push(body());
  };

  start(seed: PullSchedulerSeed): PullScheduler {
    this.values.set(leaseKey, this.lease);
    this.values.set(heartbeatKey, { ...this.lease, at: this.now });

    return createPullScheduler(
      {
        run: this.run,
        now: () => this.now,
        heldLease: () => this.lease,
        read: this.read,
        notices: silentNotices,
        publish: () => undefined,
        publishReadTimes: () => undefined,
        publishOutcomes: () => undefined,
        windowActive: () => true,
      },
      this.lease,
      seed,
    );
  }

  setRequests(repository: string, at: number): void {
    this.values.set(pullRetryRequestsKey, {
      version: 1,
      requests: [{ consumer: 'window-a', id: 'r-1', repository, at }],
    });
  }

  callsIn(folder: string): PendingCall[] {
    return this.calls.filter((call) => call.cwd === folder);
  }

  async settle(): Promise<void> {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  }

  async respond(call: PendingCall, result: ExecResult): Promise<void> {
    call.respond(result);
    await this.settle();
  }

  async respondRemotes(folder: string): Promise<void> {
    const [names] = this.callsIn(folder);

    await this.respond(names as PendingCall, ok);

    const [, url] = this.callsIn(folder);

    await this.respond(url as PendingCall, remoteUrl);
  }
}

const ok: ExecResult = { code: 0, stdout: 'origin\n', stderr: '' };

const remoteUrl: ExecResult = { code: 0, stdout: 'git@github.com:koja/koja.git\n', stderr: '' };

const offline: ExecResult = { code: 1, stdout: '', stderr: 'offline' };

const repositoryAt = (folder: string): string => repositoryOf(null, `${folder}/.git`).key;

describe('createPullScheduler Retry', () => {
  test('Retry ignores backoff and the cap', async () => {
    const harness = new RetryHarness();
    const scheduler = harness.start({ pulls: {}, readTimes: {} });
    const git = factsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual(['/code/a', '/code/b']);

    await harness.respondRemotes('/code/a');

    const failedRead = harness.callsIn('/code/a')[2] as PendingCall;

    await harness.respond(failedRead, offline);

    harness.now = start + 60_000;
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual([
      '/code/a',
      '/code/b',
      '/code/a',
      '/code/a',
      '/code/c',
    ]);

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls).toHaveLength(5);

    harness.setRequests(repositoryAt('/code/a'), harness.now);
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.callsIn('/code/a')).toHaveLength(4);
    expect(harness.calls.at(-1)?.cwd).toBe('/code/a');
  });
});
