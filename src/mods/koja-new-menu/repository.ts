import type { Place } from '../../data/gitIdentity.ts';
import type { ReadShared } from '../../data/lease.ts';
import { recordNotices } from '../../data/recordNotices.ts';
import { repositoryNameOf } from '../../data/repositoryName.ts';
import type { GitFacts, WorktreeGit } from '../../data/snapshot.ts';
import { readStoredSnapshot } from '../../data/storedSnapshot.ts';

const nameInFacts = (facts: GitFacts, place: Place): string | null => {
  const entry = facts.places[place.key];

  if (entry?.kind !== 'repository') {
    return null;
  }

  const worktree = facts.worktrees[entry.worktree];

  if (worktree === undefined) {
    return null;
  }

  const main = Object.values(facts.worktrees).find(
    (candidate: WorktreeGit) =>
      !candidate.linked && candidate.repository.key === worktree.repository.key,
  );

  return repositoryNameOf(main?.root ?? null, worktree.repository.commonDirectory);
};

export const repositoryNameAt = (read: ReadShared, place: Place): string | null => {
  const snapshot = readStoredSnapshot(read, recordNotices);

  return snapshot === null ? null : nameInFacts(snapshot.facts.git, place);
};
