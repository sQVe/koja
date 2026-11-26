import type { Status } from 'herdr';

export interface StatusFilter {
  label: string;
  statuses: Status[] | null;
  empty: string;
}

export const statusFilters: StatusFilter[] = [
  { label: 'All', statuses: null, empty: 'No space matches.' },
  { label: 'Waiting', statuses: ['blocked'], empty: 'Nothing is waiting.' },
  { label: 'Done', statuses: ['done'], empty: 'Nothing is done.' },
  { label: 'Working', statuses: ['working'], empty: 'Nothing is working.' },
  { label: 'Idle', statuses: ['idle'], empty: 'Nothing is idle.' },
];

// A filter draws the mark of its one status; All covers every status, so it draws none.
export const filterMark = (filter: StatusFilter): Status | null => filter.statuses?.[0] ?? null;

export const allFilter = statusFilters[0] ?? { label: 'All', statuses: null, empty: '' };
