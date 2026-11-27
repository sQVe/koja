import type { DataState } from '../../data/consumer.ts';
import { folderNameOf } from '../../data/fields.ts';
import { ticketIdOf } from '../../data/linearTickets.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { RepositoryPulls } from '../../data/snapshot.ts';
import type { SpaceStack, WorktreeStackFacts } from '../../data/spaceStack.ts';
import { worktreeStackFactsOf } from '../../data/spaceStack.ts';
import type { KeptNeed } from './gitFacts.ts';
import { needAt, pullFactsOf } from './gitFacts.ts';
import type { InboxGroup } from './inbox.ts';
import { inboxGroups, inboxIds } from './inbox.ts';
import type { Project } from './projects.ts';
import { groupProjects, noFolds, shownRows, shownSpaces } from './projects.ts';
import { pullOf } from './pulls.ts';
import { showsTitle } from './rows.ts';
import type { SidebarView } from './sidebarView.ts';
import type { FoldedKeys, ListedSpace } from './tree.ts';

export interface RowModel {
  row: ListedSpace;
  project: string;
  pull: Pull | null;
  ticketTitle: string | null;
  need: StackNeed | null;
  stack: SpaceStack | null;
}

export type ListModel =
  | { view: 'projects'; projects: Project[]; rows: ReadonlyMap<string, RowModel>; ids: string[] }
  | { view: 'inbox'; groups: InboxGroup[]; rows: ReadonlyMap<string, RowModel>; ids: string[] };

const stackFactsAt = (state: DataState, row: ListedSpace): WorktreeStackFacts | null => {
  if (state.kind === 'unavailable' || row.git === null) {
    return null;
  }

  return worktreeStackFactsOf(state.snapshot.facts, row.git.worktreeKey);
};

const ticketTitleOf = (
  state: DataState,
  row: ListedSpace,
  stackTitle: string | null,
): string | null => {
  if (state.kind === 'unavailable' || row.git === null) {
    return null;
  }

  if (showsTitle(stackTitle)) {
    return stackTitle;
  }

  const id = ticketIdOf(row.git.branch, folderNameOf(row.git.root));

  if (id === null) {
    return null;
  }

  return state.snapshot.facts.trackers[row.git.repo.key]?.tickets[id]?.title ?? null;
};

const rowModelOf = (
  state: DataState,
  row: ListedSpace,
  project: string,
  pulls: Record<string, RepositoryPulls>,
  lastNeeds: Map<string, KeptNeed>,
): RowModel => {
  const facts = stackFactsAt(state, row);

  return {
    row,
    project,
    pull: pullOf(row.git, pulls),
    ticketTitle: ticketTitleOf(state, row, facts?.title ?? null),
    need: needAt(state, row.git, facts?.need ?? null, lastNeeds),
    stack: facts?.stack ?? null,
  };
};

const needOf = (rows: ReadonlyMap<string, RowModel>, row: ListedSpace): StackNeed | null =>
  rows.get(row.space.id)?.need ?? null;

export const listModelOf = (input: {
  state: DataState;
  listed: ListedSpace[];
  folds: FoldedKeys;
  view: SidebarView;
  lastNeeds: Map<string, KeptNeed>;
}): ListModel => {
  const { state, listed, folds, view, lastNeeds } = input;
  const pulls = pullFactsOf(state);
  const all = groupProjects(listed, noFolds);
  const shown = shownRows(all);
  const rows = new Map<string, RowModel>();

  for (const { row, project } of shown) {
    rows.set(row.space.id, rowModelOf(state, row, project, pulls, lastNeeds));
  }

  if (view === 'inbox') {
    const groups = inboxGroups(shown, (row) => needOf(rows, row));

    return { view, groups, rows, ids: inboxIds(groups) };
  }

  const projects = groupProjects(listed, folds);

  return {
    view,
    projects,
    rows,
    ids: shownSpaces(projects).map((row) => row.space.id),
  };
};
