import type { Lease } from './lease.ts';
import { sameHolder } from './lease.ts';

type ResultDecision = 'apply' | 'retry' | 'drop';

interface DecisionInput {
  key: string;
  stopped: boolean;
  live: ReadonlySet<string>;
  epoch: number;
  sequence: number;
  worktree: string | null;
  held: Lease | null;
  lease: Lease;
}

export class ReadFences {
  private readonly epochs = new Map<string, number>();
  private readonly writtenPlaces = new Map<string, number>();
  private readonly writtenWorktrees = new Map<string, number>();

  epochOf(key: string): number {
    return this.epochs.get(key) ?? 0;
  }

  leave(key: string, inFlight: boolean): void {
    if (inFlight) {
      this.epochs.set(key, this.epochOf(key) + 1);
    } else {
      this.epochs.delete(key);
    }

    this.writtenPlaces.delete(key);
  }

  wrote(key: string, worktree: string | null, sequence: number): void {
    this.writtenPlaces.set(key, sequence);

    if (worktree !== null) {
      this.writtenWorktrees.set(worktree, sequence);
    }
  }

  decide(input: DecisionInput): ResultDecision {
    if (input.stopped) {
      return 'drop';
    }

    if (!input.live.has(input.key)) {
      return 'drop';
    }

    if (this.epochOf(input.key) !== input.epoch) {
      return 'drop';
    }

    if (input.held === null || !sameHolder(input.held, input.lease)) {
      return 'drop';
    }

    const writtenPlace = this.writtenPlaces.get(input.key) ?? 0;

    if (writtenPlace > input.sequence) {
      return 'drop';
    }

    if (input.worktree === null) {
      return 'apply';
    }

    const writtenWorktree = this.writtenWorktrees.get(input.worktree) ?? 0;

    return writtenWorktree > input.sequence ? 'retry' : 'apply';
  }

  retire(
    running: ReadonlyMap<string, { sequence: number; epoch: number }>,
    live: ReadonlySet<string>,
  ): void {
    let lowest = Infinity;

    for (const [key, read] of running) {
      if (!live.has(key) || this.epochOf(key) !== read.epoch) {
        continue;
      }

      lowest = Math.min(lowest, read.sequence);
    }

    for (const [key, sequence] of this.writtenPlaces) {
      if (sequence <= lowest) {
        this.writtenPlaces.delete(key);
      }
    }

    for (const [key, sequence] of this.writtenWorktrees) {
      if (sequence <= lowest) {
        this.writtenWorktrees.delete(key);
      }
    }

    for (const key of this.epochs.keys()) {
      if (!running.has(key)) {
        this.epochs.delete(key);
      }
    }
  }
}
