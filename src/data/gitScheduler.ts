import type { Context } from 'gpui-kit';

import type { WatchFolder } from './folderWatch.ts';
import type { DueState, GitWorld, ReadMemory } from './gitDue.ts';
import { duePlaces, emptyDueState, livePlaceKeys, worktreeRepresentatives } from './gitDue.ts';
import { ReadFences } from './gitFences.ts';
import type { Branch, GitIdentity, Place, RunCommand } from './gitIdentity.ts';
import { readGitIdentity, worktreeKeyOf } from './gitIdentity.ts';
import type { WatchRegistry } from './gitWatches.ts';
import { createWatchRegistry, usedRepositories } from './gitWatches.ts';
import type { Lease } from './lease.ts';
import { sameHolder } from './lease.ts';
import { placesOf } from './places.ts';
import type { Facts, GitFacts, PlaceGit, WorktreeGit } from './snapshot.ts';

export type { GitWorld } from './gitDue.ts';

export interface GitSchedulerDependencies {
  run: RunCommand;
  watchFolder: WatchFolder;
  now: () => number;
  heldLease: () => Lease | null;
  publish: (lease: Lease, facts: Facts) => void;
}

export interface GitScheduler {
  tick: (world: GitWorld, cx: Context) => void;
  facts: () => Facts;
  stop: () => void;
}

interface RunningRead {
  sequence: number;
  worktree: string | null;
  epoch: number;
}

const debounceMilliseconds = 250;
const readLimit = 4;

const branchName = (branch: Branch): string | null =>
  branch.kind === 'detached' ? null : branch.name;

const worktreeGitOf = (
  identity: Exclude<GitIdentity, { kind: 'failed' | 'none' }>,
): WorktreeGit => {
  if (identity.kind === 'bare') {
    return {
      repository: identity.repository,
      root: identity.place.folder,
      branch: branchName(identity.branch),
      linked: false,
    };
  }

  return {
    repository: identity.repository,
    root: identity.worktree.top,
    branch: branchName(identity.branch),
    linked: identity.kind === 'linked',
  };
};

const compareDue = (first: [string, number], second: [string, number]): number => {
  if (first[1] !== second[1]) {
    return first[1] - second[1];
  }

  if (first[0] === second[0]) {
    return 0;
  }

  return first[0] < second[0] ? -1 : 1;
};

class Scheduler implements GitScheduler {
  private places: Record<string, PlaceGit>;
  private worktrees: Record<string, WorktreeGit>;
  private state: DueState = emptyDueState();
  private live: ReadonlySet<string> = new Set();
  private reads: Record<string, ReadMemory> = {};
  private readonly marks = new Map<string, number>();
  private readonly watchMarks = new Map<string, number>();
  private readonly checkouts = new Set<string>();
  private readonly fences = new ReadFences();
  private readonly running = new Map<string, RunningRead>();
  private readonly runningWorktrees = new Map<string, number>();
  private readonly watches: WatchRegistry;
  private sequence = 0;
  private stopped = false;

  constructor(
    private readonly dependencies: GitSchedulerDependencies,
    private readonly lease: Lease,
    seed: Facts,
  ) {
    this.places = { ...seed.git.places };
    this.worktrees = { ...seed.git.worktrees };
    this.watches = createWatchRegistry(dependencies.watchFolder, dependencies.now);
  }

  facts(): Facts {
    return { git: this.gitFacts() };
  }

  tick(world: GitWorld, cx: Context): void {
    if (this.stopped) {
      return;
    }

    const now = this.dependencies.now();
    const places = placesOf(world.spaces, world.panes);
    const live = livePlaceKeys(places);

    if (this.prune(live)) {
      this.publishIfHeld();
    }

    const due = duePlaces(
      { state: this.state, reads: this.reads, facts: this.gitFacts() },
      world,
      now,
    );

    this.state = due.state;
    this.applyEvents();

    for (const key of due.due) {
      this.mark(key, now);
    }

    this.startReads(due.state.places, live, cx, now);
  }

  stop(): void {
    this.stopped = true;
    this.watches.stop();
  }

  private gitFacts(): GitFacts {
    return { places: this.places, worktrees: this.worktrees };
  }

  private mark(key: string, at: number): void {
    const current = this.marks.get(key);

    if (current !== undefined && current <= at) {
      return;
    }

    this.marks.set(key, at);
  }

  private forgetLeft(live: ReadonlySet<string>): void {
    for (const key of this.live) {
      if (live.has(key)) {
        continue;
      }

      this.fences.leave(key, this.running.has(key));

      this.marks.delete(key);
    }

    const kept: Record<string, ReadMemory> = {};

    for (const [key, memory] of Object.entries(this.reads)) {
      if (live.has(key)) {
        kept[key] = memory;
      }
    }

    this.reads = kept;
  }

  private prune(live: ReadonlySet<string>): boolean {
    this.forgetLeft(live);
    this.live = live;

    const kept: Record<string, PlaceGit> = {};
    let changed = false;

    for (const [key, place] of Object.entries(this.places)) {
      if (live.has(key)) {
        kept[key] = place;

        continue;
      }

      changed = true;
    }

    if (changed) {
      this.places = kept;
    }

    const worktreesChanged = this.pruneWorktrees();

    this.watches.cancelUnused(
      usedRepositories(this.places, this.worktrees, this.checkouts, this.live),
    );

    return changed || worktreesChanged;
  }

  private pruneWorktrees(): boolean {
    const named = new Set<string>();

    for (const [key, place] of Object.entries(this.places)) {
      if (this.live.has(key) && place.kind === 'repository') {
        named.add(place.worktree);
      }
    }

    const kept: Record<string, WorktreeGit> = {};
    let changed = false;

    for (const [key, worktree] of Object.entries(this.worktrees)) {
      if (named.has(key)) {
        kept[key] = worktree;

        continue;
      }

      changed = true;
      this.checkouts.delete(key);
      this.watchMarks.delete(key);
    }

    if (changed) {
      this.worktrees = kept;
    }

    return changed;
  }

  private applyEvents(): void {
    const events = this.watches.takeEvents();

    for (const [repositoryKey, eventAt] of events) {
      this.markRepository(repositoryKey, eventAt + debounceMilliseconds);
    }
  }

  private markRepository(repositoryKey: string, at: number): void {
    for (const [worktreeKey, worktree] of Object.entries(this.worktrees)) {
      if (worktree.repository.key !== repositoryKey) {
        continue;
      }

      const current = this.watchMarks.get(worktreeKey);

      if (current !== undefined && current <= at) {
        continue;
      }

      this.watchMarks.set(worktreeKey, at);
    }
  }

  private dueMarks(): [string, number][] {
    const due = new Map<string, number>(this.marks);
    const representatives = worktreeRepresentatives(this.places, this.live);

    for (const [worktreeKey, at] of this.watchMarks) {
      const representative = representatives.get(worktreeKey);

      if (representative === undefined) {
        continue;
      }

      const current = due.get(representative);

      if (current === undefined || at < current) {
        due.set(representative, at);
      }
    }

    return [...due].toSorted(compareDue);
  }

  private gateWorktree(key: string): string | null {
    const place = this.places[key];

    if (place?.kind !== 'repository') {
      return null;
    }

    return place.worktree;
  }

  private startReads(
    places: Record<string, Place>,
    live: ReadonlySet<string>,
    cx: Context,
    now: number,
  ): void {
    const byKey = new Map<string, Place>();

    for (const place of Object.values(places)) {
      if (!byKey.has(place.key)) {
        byKey.set(place.key, place);
      }
    }

    const due = this.dueMarks();

    for (const [key, at] of due) {
      if (at > now) {
        return;
      }

      const worktree = this.gateWorktree(key);

      if (!this.startable(key, worktree, live)) {
        continue;
      }

      const place = byKey.get(key);

      if (place !== undefined) {
        this.startRead(place, worktree, cx, now);
      }
    }
  }

  private startable(key: string, worktree: string | null, live: ReadonlySet<string>): boolean {
    if (this.running.size >= readLimit) {
      return false;
    }

    if (!live.has(key) || this.running.has(key)) {
      return false;
    }

    if (worktree !== null && this.runningWorktrees.has(worktree)) {
      return false;
    }

    const held = this.dependencies.heldLease();

    return held !== null && sameHolder(held, this.lease);
  }

  private startRead(place: Place, worktree: string | null, cx: Context, now: number): void {
    this.sequence += 1;

    const sequence = this.sequence;
    const epoch = this.fences.epochOf(place.key);
    const memory = this.reads[place.key];

    this.marks.delete(place.key);
    this.running.set(place.key, { sequence, worktree, epoch });
    this.reads[place.key] = { lastReadAt: now, failure: memory?.failure ?? false };

    if (worktree !== null) {
      this.runningWorktrees.set(worktree, sequence);
      this.watchMarks.delete(worktree);
    }

    cx.spawn(async (taskCx) => {
      const identity = await readGitIdentity(this.dependencies.run, place.machine, place.folder);

      this.finish(place.key, worktree, sequence);
      this.apply(identity, sequence, epoch, taskCx);
    });
  }

  private finish(key: string, worktree: string | null, sequence: number): void {
    const running = this.running.get(key);

    if (running?.sequence === sequence) {
      this.running.delete(key);
    }

    if (worktree !== null && this.runningWorktrees.get(worktree) === sequence) {
      this.runningWorktrees.delete(worktree);
    }
  }

  private resultWorktree(identity: GitIdentity): string | null {
    if (identity.kind === 'none' || identity.kind === 'failed') {
      return null;
    }

    return worktreeKeyOf(identity);
  }

  private remember(key: string, failure: boolean): void {
    const memory = this.reads[key];

    this.reads[key] = { lastReadAt: memory?.lastReadAt ?? 0, failure };
  }

  private writeFailure(key: string): void {
    this.remember(key, true);

    if (Object.hasOwn(this.places, key)) {
      return;
    }

    this.places = { ...this.places, [key]: { kind: 'failed' } };
  }

  private write(identity: GitIdentity, sequence: number): void {
    const key = identity.place.key;
    const worktree = this.resultWorktree(identity);

    this.fences.wrote(key, worktree, sequence);

    if (identity.kind === 'failed') {
      this.writeFailure(key);

      return;
    }

    this.remember(key, false);

    if (identity.kind === 'none') {
      this.places = { ...this.places, [key]: { kind: 'none' } };

      return;
    }

    const worktreeKey = worktreeKeyOf(identity);
    const place: PlaceGit = { kind: 'repository', worktree: worktreeKey };
    const git = worktreeGitOf(identity);

    this.places = { ...this.places, [key]: place };
    this.worktrees = { ...this.worktrees, [worktreeKey]: git };

    if (identity.kind === 'bare') {
      this.checkouts.delete(worktreeKey);
    } else {
      this.checkouts.add(worktreeKey);
    }
  }

  private startWatch(identity: GitIdentity, cx: Context): void {
    if (identity.kind !== 'main' && identity.kind !== 'linked') {
      return;
    }

    if (identity.place.machine !== null) {
      return;
    }

    this.watches.start(identity.repository, cx);
  }

  private apply(identity: GitIdentity, sequence: number, epoch: number, cx: Context): void {
    const key = identity.place.key;

    const decision = this.fences.decide({
      key,
      stopped: this.stopped,
      live: this.live,
      epoch,
      sequence,
      worktree: this.resultWorktree(identity),
      held: this.dependencies.heldLease(),
      lease: this.lease,
    });

    if (decision === 'retry') {
      this.mark(key, this.dependencies.now());
    }

    if (decision === 'apply') {
      this.write(identity, sequence);
      this.pruneWorktrees();
      this.startWatch(identity, cx);

      this.watches.cancelUnused(
        usedRepositories(this.places, this.worktrees, this.checkouts, this.live),
      );

      this.publishIfHeld();
    }

    this.fences.retire(this.running, this.live);
  }

  private publishIfHeld(): void {
    const held = this.dependencies.heldLease();

    if (held === null || !sameHolder(held, this.lease)) {
      return;
    }

    this.dependencies.publish(this.lease, this.facts());
  }
}

export const createGitScheduler = (
  dependencies: GitSchedulerDependencies,
  lease: Lease,
  seed: Facts,
): GitScheduler => new Scheduler(dependencies, lease, seed);
