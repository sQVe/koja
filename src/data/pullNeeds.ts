import type {
  Pull,
  PullChecks,
  PullMergeable,
  PullMergeState,
  PullReview,
  PullThreads,
} from './pulls.ts';
import { partValueOf } from './pulls.ts';

export type PullNeed = 'failing' | 'review' | 'conflict' | 'ready';

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
