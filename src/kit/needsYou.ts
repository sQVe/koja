import type { Status } from 'herdr';

const needsYouStatuses = new Set<Status>(['blocked', 'done']);

export const needsYou = (status: Status | null): boolean =>
  status !== null && needsYouStatuses.has(status);
