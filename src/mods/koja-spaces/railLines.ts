import type { TreeRow } from './tree.ts';
import { listedOf, machineOf } from './tree.ts';

const isMemberOfGroup = (row: TreeRow, groupRepo: string | null): boolean =>
  row.kind === 'space' && groupRepo !== null && listedOf(row).git?.repo.key === groupRepo;

// A line sits between two groups when one of them is a repository. A group is a repository row
// with the worktrees it keeps, or one plain space. Each machine's rows form their own sequence,
// because the rail draws them machine by machine.
export const railLineRows = (rows: TreeRow[]): Set<TreeRow> => {
  const lined = new Set<TreeRow>();
  const groupRepos = new Map<string | null, string | null>();

  for (const row of rows) {
    const machine = machineOf(row);
    const seen = groupRepos.has(machine);
    const groupRepo = groupRepos.get(machine) ?? null;

    if (isMemberOfGroup(row, groupRepo)) {
      continue;
    }

    const followsGroup = row.kind === 'repo' || groupRepo !== null;

    if (seen && followsGroup) {
      lined.add(row);
    }

    groupRepos.set(machine, row.kind === 'repo' ? row.repo.key : null);
  }

  return lined;
};
