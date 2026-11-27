import type { StackNeed } from '../../data/pullNeeds.ts';
import type { ListedSpace } from './tree.ts';

export type InboxGroupId = 'asks' | 'pulls' | 'running' | 'quiet';

export interface InboxGroup {
  id: InboxGroupId;
  label: string;
  spaces: ListedSpace[];
}

const groupIds: readonly InboxGroupId[] = ['asks', 'pulls', 'running', 'quiet'];

const labels: Record<InboxGroupId, string> = {
  asks: 'Agent asks',
  pulls: 'PR needs you',
  running: 'Running',
  quiet: 'Quiet',
};

const emptyGroups = (): Record<InboxGroupId, ListedSpace[]> => ({
  asks: [],
  pulls: [],
  running: [],
  quiet: [],
});

const groupOf = (
  row: ListedSpace,
  needOf: (row: ListedSpace) => StackNeed | null,
): InboxGroupId => {
  if (row.status === 'blocked') {
    return 'asks';
  }

  if (needOf(row) !== null) {
    return 'pulls';
  }

  if (row.status === 'working') {
    return 'running';
  }

  return 'quiet';
};

export const inboxGroups = (
  rows: readonly ListedSpace[],
  needOf: (row: ListedSpace) => StackNeed | null,
): InboxGroup[] => {
  const spaces = emptyGroups();

  for (const row of rows) {
    spaces[groupOf(row, needOf)].push(row);
  }

  return groupIds.flatMap((id) =>
    spaces[id].length === 0 ? [] : [{ id, label: labels[id], spaces: spaces[id] }],
  );
};

export const inboxIds = (groups: readonly InboxGroup[]): string[] =>
  groups.flatMap((group) => group.spaces.map((row) => row.space.id));
