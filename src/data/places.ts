import type { PaneInfo, SpaceInfo } from 'herdr';

import { spaceFolder } from '../kit/space.ts';
import type { Place } from './gitIdentity.ts';
import { placeOf } from './gitIdentity.ts';

export const placeOfSpace = (space: SpaceInfo, paneList: PaneInfo[]): Place =>
  placeOf(space.machine ?? null, spaceFolder(space, paneList));

export const placesOf = (spaceList: SpaceInfo[], paneList: PaneInfo[]): Record<string, Place> => {
  const at: Record<string, Place> = {};

  for (const space of spaceList) {
    at[space.id] = placeOfSpace(space, paneList);
  }

  return at;
};
