// The picker's status chips, in order. Tab and shift+Tab cycle them.

import type { Status } from 'herdr';

export interface StatusFilter {
  label: string;
  statuses: Status[] | null;
  mark: Status | null;
  empty: string;
}

export const statusFilters: StatusFilter[] = [
  { label: 'All', statuses: null, mark: null, empty: 'No space matches.' },
  {
    label: 'Needs you',
    statuses: ['blocked', 'done'],
    mark: 'blocked',
    empty: 'Nothing needs you.',
  },
  { label: 'Blocked', statuses: ['blocked'], mark: 'blocked', empty: 'Nothing is blocked.' },
  { label: 'Done', statuses: ['done'], mark: 'done', empty: 'Nothing is done.' },
  { label: 'Working', statuses: ['working'], mark: 'working', empty: 'Nothing is working.' },
  { label: 'Idle', statuses: ['idle'], mark: 'idle', empty: 'Nothing is idle.' },
];

export const allFilter = statusFilters[0] ?? {
  label: 'All',
  statuses: null,
  mark: null,
  empty: '',
};
