import type { SpaceInfo, Status } from 'herdr';

import { folderNameOf } from '../../data/fields.ts';
import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';

export interface GitInfo {
  branch: string | null;
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

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => folderNameOf(root).replace(/\.git$/, '');
