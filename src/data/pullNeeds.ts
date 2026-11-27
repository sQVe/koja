import type {
  PullChecks,
  PullMergeable,
  PullMergeState,
  PullReview,
  PullThreads,
} from './pullAnswer.ts';
import type { Pull } from './pulls.ts';
import { partValueOf } from './pulls.ts';
import type { StackBranch } from './stacks.ts';

export type PullNeed = 'failing' | 'review' | 'conflict' | 'ready';

export type StackNeed = 'conflict' | 'failing' | 'review' | 'restack' | 'merge';

const needRanks: Record<StackNeed, number> = {
  conflict: 0,
  failing: 1,
  review: 2,
  restack: 3,
  merge: 4,
};

const hasFailingChecks = (checks: PullChecks | null): boolean => checks === 'failing';

const asksForReview = (review: PullReview, threads: PullThreads | null): boolean => {
  if (review === 'changesRequested') {
    return true;
  }

  return threads !== null && threads.unresolved > 0;
};

const conflicts = (mergeable: PullMergeable): boolean => mergeable === 'conflicting';

const settles = (mergeState: PullMergeState): boolean =>
  mergeState === 'clean' || mergeState === 'hasHooks';

const passOrAbsent = (checks: PullChecks): boolean => checks === 'passing' || checks === 'none';

const quietThreads = (threads: PullThreads): boolean =>
  threads.unresolved === 0 && threads.complete;

const isReady = (pull: Pull): boolean => {
  if (pull.mergeable !== 'mergeable' || !settles(pull.mergeState)) {
    return false;
  }

  if (pull.checks.kind !== 'read' || pull.threads.kind !== 'read') {
    return false;
  }

  const settledReview = pull.review === 'approved' || pull.review === 'none';

  return passOrAbsent(pull.checks.value) && quietThreads(pull.threads.value) && settledReview;
};

export const pullNeeds = (pull: Pull): PullNeed[] => {
  if (pull.state !== 'OPEN' || pull.isDraft) {
    return [];
  }

  const needs: PullNeed[] = [];

  if (hasFailingChecks(partValueOf(pull.checks))) {
    needs.push('failing');
  }

  if (asksForReview(pull.review, partValueOf(pull.threads))) {
    needs.push('review');
  }

  if (conflicts(pull.mergeable)) {
    needs.push('conflict');
  }

  if (isReady(pull)) {
    needs.push('ready');
  }

  return needs;
};

export const mostBlockingNeed = (needs: readonly (StackNeed | null)[]): StackNeed | null => {
  const present = needs.filter((need): need is StackNeed => need !== null);
  const ordered = present.toSorted((first, second) => needRanks[first] - needRanks[second]);

  return ordered[0] ?? null;
};

const stackNeedOf = (need: PullNeed): StackNeed => (need === 'ready' ? 'merge' : need);

export const pullStackNeed = (
  pull: Pull | null,
  restack: StackBranch['restack'],
): StackNeed | null => {
  if (pull === null) {
    return null;
  }

  if (pull.state !== 'OPEN' || pull.isDraft) {
    return null;
  }

  const needs = pullNeeds(pull).map(stackNeedOf);
  const withRestack: StackNeed[] = restack === 'needed' ? [...needs, 'restack'] : needs;

  return mostBlockingNeed(withRestack);
};
