import type { Status } from 'herdr';

export const needsYouStatuses: Status[] = ['blocked', 'done'];

export const needsYou = (status: Status | null): boolean =>
  status !== null && needsYouStatuses.includes(status);
