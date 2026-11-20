import type { PaneInfo, SpaceInfo } from 'herdr';

import { spaceFolder } from '../kit/space.ts';
import type { Place } from './gitIdentity.ts';
import { placeOf } from './gitIdentity.ts';

export interface PlaceObservation {
  bySpace: Record<string, Place>;
  byKey: Record<string, Place>;
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

export const observePlaces = (spaceList: SpaceInfo[], paneList: PaneInfo[]): PlaceObservation => {
  const bySpace = placesOf(spaceList, paneList);
  const byKey: Record<string, Place> = {};

  for (const place of Object.values(bySpace)) {
    if (place.folder === '' || Object.hasOwn(byKey, place.key)) {
      continue;
    }

    byKey[place.key] = place;
  }

  return { bySpace, byKey };
};
