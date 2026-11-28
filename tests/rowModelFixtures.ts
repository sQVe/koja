import type { DataState } from '../src/data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import { ticketIdOf } from '../src/data/linearTickets.ts';
import type { Pull } from '../src/data/pulls.ts';
import { emptyFacts, snapshotVersion } from '../src/data/snapshot.ts';
import type { TicketFacts } from '../src/data/snapshot.ts';
import type { SpaceStack, StackPull } from '../src/data/spaceStack.ts';
import type { ListModel, RowModel } from '../src/mods/koja-spaces/listModel.ts';
import type { GitInfo, ListedSpace } from '../src/mods/koja-spaces/tree.ts';

const kojaRepository = repositoryOf(null, '/code/koja/.git');

export const liveState: DataState = {
  kind: 'live',
  snapshot: { version: snapshotVersion, revision: 1, facts: emptyFacts() },
  owner: 'window-a',
  generation: 1,
  heartbeatAt: 0,
  staleAt: 30_000,
};

const listedSpaceOf = (options: {
  id: string;
  linked?: boolean;
  branch?: string | null;
  folder?: string;
}): ListedSpace => {
  const folder = options.folder ?? `/code/${options.id}`;

  const git: GitInfo = {
    branch: options.branch ?? 'main',
    worktreeKey: worktreeOf(null, folder).key,
    repo: kojaRepository,
    root: folder,
    linked: options.linked ?? true,
  };

  const space = {
    id: options.id,
    index: 1,
    name: `name-${options.id}`,
    named: true,
    folder,
    machine: null,
    branch: null,
    active: false,
    status: null,
    tabs: [],
  };

  return { space, git, status: null, place: placeOf(null, folder) };
};

export const rowModelOf = (options: {
  id: string;
  title?: string;
  pull?: Pull | null;
  ticket?: TicketFacts | null;
  stack?: SpaceStack | null;
  linked?: boolean;
  project?: string;
  branch?: string | null;
  folder?: string;
}): RowModel => ({
  row: listedSpaceOf({
    id: options.id,
    ...(options.linked === undefined ? {} : { linked: options.linked }),
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.folder === undefined ? {} : { folder: options.folder }),
  }),
  project: options.project ?? 'koja',
  title: options.title ?? `name-${options.id}`,
  pull: options.pull ?? null,
  ticket: options.ticket ?? null,
  ticketTitle: options.ticket?.title ?? null,
  need: null,
  stack: options.stack ?? null,
});

export const modelOf = (rows: RowModel[]): ListModel => ({
  view: 'projects',
  projects: [],
  rows: new Map(rows.map((row) => [row.row.space.id, row])),
  ids: rows.map((row) => row.row.space.id),
});

export const stackPull = (options: {
  branch: string;
  number: number | null;
  url: string | null;
  title: string | null;
  state: StackPull['state'];
  checkedOut?: boolean;
}): StackPull => ({
  branch: options.branch,
  ticket: ticketIdOf(options.branch, ''),
  number: options.number,
  url: options.url,
  title: options.title,
  state: options.state,
  checkedOut: options.checkedOut ?? false,
  restack: 'none',
  need: null,
});

export const checkedOutStack = (number: number | null, url: string | null): SpaceStack => ({
  pulls: [
    stackPull({
      branch: 'me-11-eleven',
      number,
      url,
      title: 'The checked-out pull',
      state: 'open',
      checkedOut: true,
    }),
  ],
  merged: 0,
  total: 1,
});
