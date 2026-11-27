import type { SpaceInfo, Status } from 'herdr';

import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';

export interface GitInfo {
  branch: string | null;
  worktreeKey: string;
  repo: RepositoryIdentity;
  root: string;
  linked: boolean;
}

export interface ListedSpace {
  space: SpaceInfo;
  git: GitInfo | null;
  status: Status | null;
  place: Place;
}

export interface FoldedKeys {
  has: (key: string) => boolean;
}
