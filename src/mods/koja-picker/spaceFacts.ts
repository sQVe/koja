import { shared } from 'herdr';
import type { PaneInfo, SpaceInfo } from 'herdr';

import { readDataState } from '../../data/consumer.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { PullNeed } from '../../data/pullNeeds.ts';
import { pullNeeds } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { GitFacts, RepositoryPulls, WorktreeGit } from '../../data/snapshot.ts';

export interface SpaceFacts {
  project: string | null;
  pull: number | null;
  need: PullNeed | null;
}

// A row shows one work icon, so the most urgent need wins.
const needOrder: PullNeed[] = ['conflict', 'failing', 'review', 'ready'];

const folderName = (path: string): string => path.split('/').findLast((part) => part !== '') ?? '';

const repoPathName = (path: string): string => {
  const parts = path.split('/');
  const last = parts.at(-1);
  const checkout = last === '.git' || last === '.bare' ? parts.slice(0, -1).join('/') : path;

  return folderName(checkout);
};

// A linked worktree sits in a folder of its own, so its project takes the name of the repository
// it belongs to.
const projectName = (worktree: WorktreeGit): string =>
  worktree.linked ? repoPathName(worktree.repository.commonDirectory) : folderName(worktree.root);

const pullOfBranch = (worktree: WorktreeGit, repository: RepositoryPulls | null): Pull | null => {
  if (worktree.branch === null || repository === null) {
    return null;
  }

  const mine = repository.pulls.filter((pull) => pull.headRefName === worktree.branch);

  return mine.find((pull) => pull.state === 'OPEN') ?? mine[0] ?? null;
};

const needOf = (pull: Pull): PullNeed | null => {
  const needs = pullNeeds(pull);

  return needOrder.find((need) => needs.includes(need)) ?? null;
};

const worktreeAt = (place: string, git: GitFacts): WorktreeGit | null => {
  const entry = git.places[place];

  if (entry?.kind !== 'repository') {
    return null;
  }

  return git.worktrees[entry.worktree] ?? null;
};

export const spaceFacts = (
  spaceList: SpaceInfo[],
  paneList: PaneInfo[],
): Record<string, SpaceFacts> => {
  const state = readDataState(shared, Date.now());

  if (state.kind === 'unavailable') {
    return {};
  }

  const { git, pulls } = state.snapshot.facts;
  const facts: Record<string, SpaceFacts> = {};

  for (const space of spaceList) {
    const worktree = worktreeAt(placeOfSpace(space, paneList).key, git);

    if (worktree === null) {
      continue;
    }

    const pull = pullOfBranch(worktree, pulls[worktree.repository.key] ?? null);

    facts[space.id] = {
      project: projectName(worktree),
      pull: pull?.number ?? null,
      need: pull === null ? null : needOf(pull),
    };
  }

  return facts;
};
