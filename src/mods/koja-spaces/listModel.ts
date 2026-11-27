import type { DataState } from '../../data/consumer.ts';
import { folderNameOf } from '../../data/fields.ts';
import { ticketIdOf } from '../../data/linearTickets.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { Facts, TicketFacts } from '../../data/snapshot.ts';
import type { SpaceStack, WorktreeStackFacts } from '../../data/spaceStack.ts';
import { worktreeStackFactsOf } from '../../data/spaceStack.ts';
import type { KeptNeed } from './gitFacts.ts';
import { needAt, pullFactsOf } from './gitFacts.ts';
import type { InboxGroup } from './inbox.ts';
import { inboxGroups, inboxIds } from './inbox.ts';
import type { Project } from './projects.ts';
import { groupProjects, noFolds, shownRows, shownSpaces } from './projects.ts';
import { pullOf } from './pulls.ts';
import { rowTitleOf, showsTitle } from './rows.ts';
import type { SidebarView } from './sidebarView.ts';
import type { FoldedKeys, GitInfo, ListedSpace } from './tree.ts';

export interface RowModel {
  row: ListedSpace;
  project: string;
  title: string;
  pull: Pull | null;
  ticket: TicketFacts | null;
  ticketTitle: string | null;
  need: StackNeed | null;
  stack: SpaceStack | null;
}

export type ListModel =
  | { view: 'projects'; projects: Project[]; rows: ReadonlyMap<string, RowModel>; ids: string[] }
  | { view: 'inbox'; groups: InboxGroup[]; rows: ReadonlyMap<string, RowModel>; ids: string[] };

interface ReadableRow {
  facts: Facts;
  git: GitInfo;
}

const readableRowOf = (state: DataState, row: ListedSpace): ReadableRow | null => {
  if (state.kind === 'unavailable' || row.git === null) {
    return null;
  }

  return { facts: state.snapshot.facts, git: row.git };
};

const stackFactsOf = (readable: ReadableRow): WorktreeStackFacts | null =>
  worktreeStackFactsOf(readable.facts, readable.git.worktreeKey);

const ticketOf = (state: DataState, row: ListedSpace): TicketFacts | null => {
  const readable = readableRowOf(state, row);

  if (readable === null) {
    return null;
  }

  const id = ticketIdOf(readable.git.branch, folderNameOf(readable.git.root));

  if (id === null) {
    return null;
  }

  return readable.facts.trackers[readable.git.repo.key]?.tickets[id] ?? null;
};

const ticketTitleOf = (ticket: TicketFacts | null, stackTitle: string | null): string | null => {
  if (showsTitle(stackTitle)) {
    return stackTitle;
  }

  return ticket?.title ?? null;
};

const rowModelOf = (
  state: DataState,
  row: ListedSpace,
  project: string,
  headerTitle: string | null,
  lastNeeds: Map<string, KeptNeed>,
): RowModel => {
  const readable = readableRowOf(state, row);
  const stackFacts = readable === null ? null : stackFactsOf(readable);
  const ticket = ticketOf(state, row);
  const pull = pullOf(row.git, pullFactsOf(state));
  const ticketTitle = ticketTitleOf(ticket, stackFacts?.title ?? null);

  const title = headerTitle ?? rowTitleOf(row.space.named, row.space.name, pull, ticketTitle);

  return {
    row,
    project,
    title,
    pull,
    ticket,
    ticketTitle,
    need: needAt(state, row.git, stackFacts?.need ?? null, lastNeeds),
    stack: stackFacts?.stack ?? null,
  };
};

const headerTitlesOf = (projects: Project[]): Map<string, string> => {
  const titles = new Map<string, string>();

  for (const project of projects) {
    if (project.main !== null) {
      titles.set(project.main.space.id, project.name);
    }
  }

  return titles;
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
  const all = groupProjects(listed, noFolds);
  const shown = shownRows(all);
  const rows = new Map<string, RowModel>();
  const headerTitles = view === 'projects' ? headerTitlesOf(all) : new Map<string, string>();

  for (const { row, project } of shown) {
    const headerTitle = headerTitles.get(row.space.id) ?? null;

    rows.set(row.space.id, rowModelOf(state, row, project, headerTitle, lastNeeds));
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
