import type { DataState } from '../src/data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { Pull } from '../src/data/pulls.ts';
import { emptyFacts, snapshotVersion } from '../src/data/snapshot.ts';
import type { TicketFacts } from '../src/data/snapshot.ts';
import type { SpaceStack } from '../src/data/spaceStack.ts';
import type { ListModel, RowModel } from '../src/mods/koja-spaces/listModel.ts';
import {
  groupProjects,
  noFolds,
  shownRows,
  shownSpaces,
} from '../src/mods/koja-spaces/projects.ts';
import type { GitInfo, ListedSpace } from '../src/mods/koja-spaces/tree.ts';
import { space } from './kojaSpacesView.ts';
import { stackOf, stackPullOf } from './pickerFixtures.ts';

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
    branch: options.branch === undefined ? 'main' : options.branch,
    worktreeKey: worktreeOf(null, folder).key,
    repo: kojaRepository,
    root: folder,
    linked: options.linked ?? true,
  };

  return {
    space: space(options.id, false, folder),
    git,
    status: null,
    place: placeOf(null, folder),
  };
};

export const rowModelOf = (options: {
  id: string;
  title?: string;
  pull?: Pull | null;
  ticket?: TicketFacts | null;
  stack?: SpaceStack | null;
  linked?: boolean;
  branch?: string | null;
  folder?: string;
}): RowModel => ({
  row: listedSpaceOf({
    id: options.id,
    ...(options.linked === undefined ? {} : { linked: options.linked }),
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.folder === undefined ? {} : { folder: options.folder }),
  }),
  // `modelOf` fills the project name from the grouping, as the sidebar does.
  project: '',
  title: options.title ?? `name-${options.id}`,
  pull: options.pull ?? null,
  ticket: options.ticket ?? null,
  ticketTitle: options.ticket?.title ?? null,
  need: null,
  stack: options.stack ?? null,
});

export const modelOf = (rows: RowModel[]): ListModel => {
  const projects = groupProjects(
    rows.map((row) => row.row),
    noFolds,
  );

  const byId = new Map(rows.map((row) => [row.row.space.id, row]));

  const named = shownRows(projects).map(({ row, project }): [string, RowModel] => {
    const model = byId.get(row.space.id);

    if (model === undefined) {
      throw new Error(`The model has no row for space ${row.space.id}.`);
    }

    return [row.space.id, { ...model, project }];
  });

  return {
    view: 'projects',
    projects,
    rows: new Map(named),
    ids: shownSpaces(projects).map((row) => row.space.id),
  };
};

export const checkedOutStack = (options: {
  branch: string;
  number: number | null;
  url: string | null;
}): SpaceStack =>
  stackOf([
    stackPullOf({
      branch: options.branch,
      number: options.number,
      url: options.url,
      title: 'The checked-out pull',
      checkedOut: true,
    }),
  ]);
