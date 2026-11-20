import type { Place } from './gitIdentity.ts';
import type { Lease } from './lease.ts';
import { sameHolder } from './lease.ts';

export interface RunningRead {
  sequence: number;
  worktree: string | null;
  invalidated: boolean;
}

type ResultDecision = 'apply' | 'retry' | 'drop';

interface DecisionInput {
  stopped: boolean;
  live: boolean;
  invalidated: boolean;
  sequence: number;
  worktree: string | null;
  held: Lease | null;
  lease: Lease;
}

export class ReadFences {
  private readonly writtenWorktrees = new Map<string, number>();

  wrote(worktree: string | null, sequence: number): void {
    if (worktree !== null) {
      this.writtenWorktrees.set(worktree, sequence);
    }
  }

  decide(input: DecisionInput): ResultDecision {
    if (input.stopped) {
      return 'drop';
    }

    if (!input.live) {
      return 'drop';
    }

    if (input.invalidated) {
      return 'drop';
    }

    if (input.held === null || !sameHolder(input.held, input.lease)) {
      return 'drop';
    }

    if (input.worktree === null) {
      return 'apply';
    }

    const written = this.writtenWorktrees.get(input.worktree) ?? 0;

    return written > input.sequence ? 'retry' : 'apply';
  }

  retire(running: ReadonlyMap<string, RunningRead>, live: Readonly<Record<string, Place>>): void {
    let lowest = Infinity;

    for (const [key, read] of running) {
      if (!Object.hasOwn(live, key) || read.invalidated) {
        continue;
      }

      lowest = Math.min(lowest, read.sequence);
    }

    for (const [key, sequence] of this.writtenWorktrees) {
      if (sequence <= lowest) {
        this.writtenWorktrees.delete(key);
      }
    }
  }
}
