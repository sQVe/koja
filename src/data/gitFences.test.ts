import { describe, expect, test } from 'bun:test';

import { ReadFences } from './gitFences.ts';
import type { Lease } from './lease.ts';

const lease: Lease = { version: 1, owner: 'owner-a', generation: 1 };

describe('ReadFences retirement', () => {
  test('retires write fences when only an invalidated read is in flight', () => {
    const fences = new ReadFences();
    const live = new Set(['/code/a']);

    fences.wrote('/code/a', 'worktree-a', 2);
    fences.leave('/code/old', true);

    fences.retire(new Map([['/code/old', { sequence: 1, epoch: 0 }]]), live);

    const decision = fences.decide({
      key: '/code/a',
      stopped: false,
      live,
      epoch: 0,
      sequence: 1,
      worktree: 'worktree-a',
      held: lease,
      lease,
    });

    expect(decision).toBe('apply');
    expect(fences.epochOf('/code/old')).toBe(1);
  });

  test('drops the invalidated read epoch once it settles', () => {
    const fences = new ReadFences();
    const live = new Set(['/code/a']);
    const running = new Map([['/code/old', { sequence: 1, epoch: 0 }]]);

    fences.leave('/code/old', true);

    fences.retire(running, live);
    expect(fences.epochOf('/code/old')).toBe(1);

    fences.retire(new Map(), live);
    expect(fences.epochOf('/code/old')).toBe(0);
  });
});
