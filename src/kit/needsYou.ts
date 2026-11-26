import type { Status } from 'herdr';

import { nextNeedsYouKey } from './normalKeys.ts';

export interface NeedsYouHint {
  keys: string[];
  text: string;
}

const needsYouStatuses = new Set<Status>(['blocked', 'done']);

export const needsYou = (status: Status | null): boolean =>
  status !== null && needsYouStatuses.has(status);

// The ask card and the attention mock scenes name the same key and words for the jump.
export const needsYouHint: NeedsYouHint = {
  keys: nextNeedsYouKey.keys,
  text: 'Go to the next pane that needs you',
};
