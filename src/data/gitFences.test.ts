import { describe, expect, test } from 'bun:test';

import type { RunningRead } from './gitFences.ts';
import { ReadFences } from './gitFences.ts';
import { placeOf } from './gitIdentity.ts';
import type { Lease } from './lease.ts';

const lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };

const live = { '/code/a': placeOf(null, '/code/a') };

const read = (overrides: Partial<RunningRead> = {}): RunningRead => ({
  sequence: 1,
  worktree: 'worktree-a',
  invalidated: false,
  ...overrides,
});

const decide = (fences: ReadFences, running: RunningRead): string =>
  fences.decide({
    stopped: false,
    live: true,
    invalidated: running.invalidated,
    sequence: running.sequence,
    worktree: running.worktree,
    held: lease,
    lease,
  });

describe('ReadFences retirement', () => {
  test('retires a worktree write when only an invalidated read is in flight', () => {
    const fences = new ReadFences();

    fences.wrote('worktree-a', 2);
    fences.retire(new Map([['/code/old', read({ invalidated: true })]]), live);

    expect(decide(fences, read())).toBe('apply');
  });

  test('retires a worktree write when its read has left', () => {
    const fences = new ReadFences();

    fences.wrote('worktree-a', 2);
    fences.retire(new Map([['/code/old', read()]]), live);

    expect(decide(fences, read())).toBe('apply');
  });

  test('keeps a worktree write while an eligible read is in flight', () => {
    const fences = new ReadFences();

    fences.wrote('worktree-a', 2);
    fences.retire(new Map([['/code/a', read()]]), live);

    expect(decide(fences, read())).toBe('retry');
  });

  test('drops a read that a departure invalidated', () => {
    const fences = new ReadFences();

    expect(decide(fences, read({ invalidated: true }))).toBe('drop');
  });
});
