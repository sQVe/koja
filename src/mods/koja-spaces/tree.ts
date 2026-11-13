import type { PaneInfo, SpaceInfo, Status } from 'herdr';

import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';
import { placeOf } from '../../data/gitIdentity.ts';
import { spaceFolder } from '../../kit/space.ts';

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

export const placeOfSpace = (space: SpaceInfo, paneList: PaneInfo[]): Place =>
  placeOf(space.machine ?? null, spaceFolder(space, paneList));

export const placesOf = (spaceList: SpaceInfo[], paneList: PaneInfo[]): Record<string, Place> => {
  const at: Record<string, Place> = {};

  for (const space of spaceList) {
    at[space.id] = placeOfSpace(space, paneList);
  }

  return at;
};

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => {
  const folder = root.split('/').findLast((part) => part !== '') ?? root;

  return folder.replace(/\.git$/, '');
};
