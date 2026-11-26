import { beforeEach, describe, expect, test } from 'bun:test';

import type { AsyncContext, Task } from 'gpui-kit';
import type { ExecResult } from 'herdr';

import type { ReadRequest } from './due.ts';
import type { ScanHost } from './scans.ts';
import { clearSharedScans, repoStatus } from './scans.ts';

interface Harness {
  host: ScanHost;
  context: AsyncContext;
  clock: { now: number };
  reads: number;
  settle: () => Promise<void>;
  answer: (result: ExecResult) => void;
  block: boolean;
  pending: (() => void) | null;
  current: { value: boolean };
}

const request = (changes: Partial<ReadRequest> = {}): ReadRequest => ({
  after: 0,
  visiting: false,
  urgent: false,
  allowInactive: false,
  ...changes,
});

const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: '' });

const harness = (changes: Partial<Harness> = {}): Harness => {
  const clock = { now: 1000 };
  const current = { value: true };

  const state: Harness = {
    clock,
    current,
    reads: 0,
    block: false,
    pending: null,
    settle: async () => undefined,
    answer: () => undefined,
    context: null as unknown as AsyncContext,
    host: null as unknown as ScanHost,
    ...changes,
  };

  let answer: ((result: ExecResult) => void) | null = null;
  let release: (() => void) | null = null;
  const tasks: { done: boolean }[] = [];

  const task = (body: (cx: AsyncContext) => Promise<void>): Task => {
    const record = { done: false };

    tasks.push(record);

    void body(state.context)
      .catch(() => undefined)
      .finally(() => {
        record.done = true;
      });

    return { is_done: () => record.done, cancel: () => undefined };
  };

  state.context = {
    notify: () => undefined,
    spawn: (body: (cx: AsyncContext) => unknown) =>
      task(body as (cx: AsyncContext) => Promise<void>),
    sleep: async () => {
      await Promise.resolve();
    },
  } as unknown as AsyncContext;

  state.settle = async () => {
    for (let index = 0; index < 200; index += 1) {
      await Promise.resolve();
    }
  };

  state.host = {
    now: () => clock.now,
    active: () => true,
    status: async () => {
      state.reads += 1;

      if (!state.block) {
        return ok(' M a.ts\0');
      }

      return new Promise<ExecResult>((resolve) => {
        answer = resolve;

        release = () => {
          resolve(ok(' M a.ts\0'));
        };
      });
    },
  };

  state.answer = (result) => {
    answer?.(result);
    answer = null;
  };

  state.pending = () => {
    release?.();
  };

  return state;
};

beforeEach(() => {
  clearSharedScans();
});

describe('repoStatus', () => {
  test('runs one status read and reports when to watch and poll next', async () => {
    const h = harness();

    const scan = await repoStatus(
      h.host,
      '/repo',
      null,
      request({ after: 900 }),
      h.context,
      () => true,
    );

    expect(h.reads).toBe(1);
    expect(scan?.status).toEqual(ok(' M a.ts\0'));
    expect(scan?.started).toBe(1000);
    expect(scan?.pollAt).toBe(11000);
    expect(scan?.watchAt).toBe(1000);
  });

  test('polls five scan lengths later, and no later than a minute', async () => {
    const h = harness();

    const slow = {
      ...h.host,
      status: async () => {
        h.reads += 1;
        h.clock.now += 4000;

        return ok('');
      },
    };

    const scan = await repoStatus(slow, '/repo', null, request(), h.context, () => true);

    expect(scan?.pollAt).toBe(1000 + 4000 + 20000);
    expect(scan?.watchAt).toBe(1000 + 4000 + 20000);
  });

  test('caps the wait at a minute for a very slow scan', async () => {
    const h = harness();

    const slow = {
      ...h.host,
      status: async () => {
        h.reads += 1;
        h.clock.now += 60000;

        return ok('');
      },
    };

    const scan = await repoStatus(slow, '/repo', null, request(), h.context, () => true);

    expect(scan?.pollAt).toBe(1000 + 60000 + 60000);
  });

  test('reuses a good scan newer than the request', async () => {
    const h = harness();

    await repoStatus(h.host, '/repo', null, request({ after: 900 }), h.context, () => true);

    const again = await repoStatus(
      h.host,
      '/repo',
      null,
      request({ after: 900 }),
      h.context,
      () => true,
    );

    expect(h.reads).toBe(1);
    expect(again?.started).toBe(1000);
  });

  test('runs a new scan when the request is newer than the last one', async () => {
    const h = harness();

    await repoStatus(h.host, '/repo', null, request({ after: 900 }), h.context, () => true);

    h.clock.now = 1200;

    await repoStatus(
      h.host,
      '/repo',
      null,
      request({ after: 1100, urgent: true }),
      h.context,
      () => true,
    );

    expect(h.reads).toBe(2);
  });

  test('runs a new scan once the poll time passes', async () => {
    const h = harness();

    await repoStatus(h.host, '/repo', null, request({ after: 900 }), h.context, () => true);

    h.clock.now = 12000;

    await repoStatus(h.host, '/repo', null, request({ after: 900 }), h.context, () => true);

    expect(h.reads).toBe(2);
  });

  test('a second panel joins the scan the first one runs', async () => {
    const h = harness();

    h.block = true;

    const first = repoStatus(
      h.host,
      '/repo',
      null,
      request({ visiting: true, urgent: true }),
      h.context,
      () => true,
    );

    await h.settle();

    expect(h.reads).toBe(1);

    const second = repoStatus(
      h.host,
      '/repo',
      null,
      request({ after: 500 }),
      h.context,
      () => true,
    );

    await h.settle();

    expect(h.reads).toBe(1);

    h.pending?.();

    await h.settle();

    const [a, b] = await Promise.all([first, second]);

    expect(h.reads).toBe(1);
    expect(a?.started).toBe(1000);
    expect(b?.started).toBe(1000);
  });

  test('starts no scan while the window is hidden, unless a visit asks for one', async () => {
    const h = harness();
    const hidden = { ...h.host, active: () => false };

    const skipped = await repoStatus(
      hidden,
      '/repo',
      null,
      request({ after: 1 }),
      h.context,
      () => true,
    );

    expect(skipped).toBeNull();
    expect(h.reads).toBe(0);

    const visited = await repoStatus(
      hidden,
      '/repo',
      null,
      request({ after: 1, visiting: true, allowInactive: true }),
      h.context,
      () => true,
    );

    expect(h.reads).toBe(1);
    expect(visited?.started).toBe(1000);
  });

  test('a failed scan is not reused', async () => {
    const h = harness();

    const failing = {
      ...h.host,
      status: async (): Promise<ExecResult> => {
        h.reads += 1;

        return { code: 128, stdout: '', stderr: 'no' };
      },
    };

    await repoStatus(failing, '/repo', null, request({ after: 900 }), h.context, () => true);

    h.clock.now = 1200;

    await repoStatus(failing, '/repo', null, request({ after: 900 }), h.context, () => true);

    expect(h.reads).toBe(2);
  });

  test('keeps the error of a status call that throws', async () => {
    const h = harness();

    const failing = {
      ...h.host,
      status: async (): Promise<ExecResult> => {
        throw new Error('exec refused');
      },
    };

    const scan = await repoStatus(failing, '/repo', null, request(), h.context, () => true);

    expect(String(scan?.error)).toBe('Error: exec refused');
    expect(scan?.status).toBeNull();
  });

  test('reports no scan once the panel has left the folder', async () => {
    const h = harness();

    h.block = true;

    const read = repoStatus(h.host, '/repo', null, request(), h.context, () => h.current.value);

    await h.settle();

    h.current.value = false;
    h.pending?.();

    await h.settle();

    expect(await read).toBeNull();
  });
});
