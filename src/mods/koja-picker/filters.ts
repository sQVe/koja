import type { Status } from 'herdr';

export interface StatusFilter {
  label: string;
  statuses: Status[] | null;
  mark: Status | null;
  empty: string;
}

export const statusFilters: StatusFilter[] = [
  { label: 'All', statuses: null, mark: null, empty: 'No space matches.' },
  { label: 'Waiting', statuses: ['blocked'], mark: 'blocked', empty: 'Nothing is waiting.' },
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
