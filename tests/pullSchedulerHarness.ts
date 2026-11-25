import type { ExecResult } from 'herdr';

import type { Lease, ReadShared, WriteShared } from '../src/data/lease.ts';
import { heartbeatKey, leaseKey } from '../src/data/lease.ts';
import type { PullReadTimes } from '../src/data/pullReadTimes.ts';
import { createPullReadTimesPublisher } from '../src/data/pullReadTimes.ts';
import type { PullRetryOutcome, PullRetryRequest } from '../src/data/pullRetry.ts';
import {
  createPullRetryOutcomesPublisher,
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
  readPullRetryOutcomes,
} from '../src/data/pullRetry.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { PullScheduler, PullSchedulerSeed } from '../src/data/pullScheduler.ts';
import { createPullScheduler } from '../src/data/pullScheduler.ts';
import type { RecordNotices } from '../src/data/recordNotices.ts';
import { createRecordNotices } from '../src/data/recordNotices.ts';
import type { RepositoryPulls } from '../src/data/snapshot.ts';
import { answerFrom } from './pullAnswers.ts';

export interface PendingCall {
  command: string;
  args: string[];
  cwd: string;
  on: string | null;
  respond: (result: ExecResult) => void;
}

interface Store {
  values: Map<string, unknown>;
  read: ReadShared;
  write: WriteShared;
}

export const pullSchedulerStart = 1_000_000;

const memoryStore = (): Store => {
  const values = new Map<string, unknown>();

  return {
    values,
    read: (key) => values.get(key),
    write: (key, value) => {
      values.set(key, structuredClone(value));
    },
  };
};

const silentNotices = (): RecordNotices => createRecordNotices(() => {});

export class PullSchedulerHarness {
  store = memoryStore();
  notices = silentNotices();
  calls: PendingCall[] = [];
  spawned: Promise<unknown>[] = [];
  published: Record<string, RepositoryPulls>[] = [];
  publishedTimes: PullReadTimes[] = [];
  publishedOutcomes: PullRetryOutcome[][] = [];
  now = pullSchedulerStart;
  windowActive = true;
  lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };
  held: Lease | null = this.lease;

  spawn = (body: () => Promise<void>): void => {
    this.spawned.push(body());
  };

  private readonly run = async (
    command: string,
    args: string[],
    options: { cwd: string; on: string | null },
  ): Promise<ExecResult> => {
    const settled = Promise.withResolvers<ExecResult>();

    const call: PendingCall = {
      command,
      args,
      cwd: options.cwd,
      on: options.on,
      respond: settled.resolve,
    };

    this.calls.push(call);

    return settled.promise;
  };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.store = memoryStore();
    this.notices = silentNotices();
    this.calls = [];
    this.spawned = [];
    this.published = [];
    this.publishedTimes = [];
    this.publishedOutcomes = [];
    this.now = pullSchedulerStart;
    this.windowActive = true;
    this.lease = { version: 1, owner: 'owner-a', generation: 1 };
    this.held = this.lease;
    this.seedLease();
  }

  seedLease(): void {
    this.store.write(leaseKey, this.lease);
    this.store.write(heartbeatKey, { ...this.lease, at: this.now });
  }

  setNow(at: number): void {
    this.now = at;
    this.store.write(heartbeatKey, { ...this.lease, at });
  }

  setRequests(requests: PullRetryRequest[]): void {
    this.store.write(pullRetryRequestsKey, { version: 1, requests });
  }

  setOutcomes(outcomes: PullRetryOutcome[]): void {
    this.store.write(pullRetryOutcomesKey, { version: 1, outcomes });
  }

  start(seed?: PullSchedulerSeed): PullScheduler {
    const initial = seed ?? { pulls: {}, readTimes: {} };

    const readTimes = createPullReadTimesPublisher(
      this.store.read,
      this.store.write,
      () => this.now,
    );

    const outcomes = createPullRetryOutcomesPublisher(
      this.store.read,
      this.store.write,
      () => this.now,
    );

    let scheduler: PullScheduler | null = null;

    const created = createPullScheduler(
      {
        run: this.run,
        now: () => this.now,
        heldLease: () => this.held,
        read: this.store.read,
        notices: this.notices,
        publish: () => {
          if (scheduler !== null) {
            this.published.push(structuredClone(scheduler.pulls()));
          }
        },
        publishReadTimes: (lease, times) => {
          this.publishedTimes.push(structuredClone(times));
          readTimes.publish(lease, times);
        },
        publishOutcomes: (lease, list) => {
          this.publishedOutcomes.push(structuredClone(list));
          outcomes.publish(lease, list);
        },
        windowActive: () => this.windowActive,
      },
      this.lease,
      initial,
    );

    scheduler = created;

    return created;
  }

  async settle(): Promise<void> {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  }

  call(index: number): PendingCall {
    const call = this.calls[index];

    if (call === undefined) {
      throw new Error(`no call at ${index}`);
    }

    return call;
  }

  async respond(index: number, result: ExecResult): Promise<void> {
    await this.respondCall(this.call(index), result);
  }

  async respondCall(call: PendingCall, result: ExecResult): Promise<void> {
    call.respond(result);
    await this.settle();
  }

  async respondRemotes(index: number): Promise<void> {
    await this.respond(index, { code: 0, stdout: 'origin\n', stderr: '' });

    const next = this.calls[index + 1];

    if (next?.command === 'git' && next.args[1] === 'get-url') {
      await this.respond(index + 1, {
        code: 0,
        stdout: 'git@github.com:koja/koja.git\n',
        stderr: '',
      });
    }
  }

  async respondIn(folder: string, result: ExecResult): Promise<void> {
    const call = this.callsIn(folder).at(-1);

    if (call === undefined) {
      throw new Error(`no call in ${folder}`);
    }

    await this.respondCall(call, result);
  }

  async respondRemotesIn(folder: string, url: string): Promise<void> {
    await this.respondIn(folder, { code: 0, stdout: 'origin\n', stderr: '' });
    await this.respondIn(folder, { code: 0, stdout: `${url}\n`, stderr: '' });
  }

  async respondPulls(index: number, pulls: Pull[]): Promise<void> {
    const call = this.call(index);
    const branchCount = call.args.filter((argument) => argument.startsWith('branch')).length;

    await this.respond(index, { code: 0, stdout: answerFrom(branchCount, pulls), stderr: '' });
  }

  callsIn(folder: string): PendingCall[] {
    return this.calls.filter((call) => call.cwd === folder);
  }

  outcomes(): PullRetryOutcome[] {
    const stored = readPullRetryOutcomes(this.store.read, this.notices);

    if (stored.kind !== 'current') {
      throw new Error('the store holds a newer outcomes record');
    }

    return stored.items;
  }
}
