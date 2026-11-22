import type { SpaceInfo, Status } from 'herdr';

import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';

export interface GitInfo {
  branch: string | null;
  repo: RepositoryIdentity;
  root: string;
  cwd: string;
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

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => {
  const folder = root.split('/').findLast((part) => part !== '') ?? root;

  return folder.replace(/\.git$/, '');
};
