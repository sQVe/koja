import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import { placeOf, repositoryOf } from '../../data/gitIdentity.ts';
import type { Project } from './projects.ts';
import { groupProjects, rootSpaceIds, shownSpaces } from './projects.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

interface SpaceOptions {
  machine?: string | null;
  status?: Status | null;
  active?: boolean;
}

const spaceOf = (id: string, folder: string, options: SpaceOptions): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder,
  machine: options.machine ?? null,
  branch: null,
  active: options.active ?? false,
  status: options.status ?? null,
  tabs: [],
});

const gitAt = (
  path: string,
  root: string,
  linked: boolean,
  machine: string | null = null,
): GitInfo => ({
  branch: 'main',
  repo: repositoryOf(machine, path),
  root,
  cwd: root,
  linked,
});

const listed = (
  id: string,
  folder: string,
  git: GitInfo | null,
  options: SpaceOptions = {},
): ListedSpace => {
  const space = spaceOf(id, folder, options);

  return { space, git, status: space.status, place: placeOf(space.machine, folder) };
};

const nothingFolded = { has: (): boolean => false };

const mainOf = (project: Project): string[] =>
  project.main === null ? [] : [`main ${project.main.space.id}`];

const describeProjects = (projects: Project[]): string[][] =>
  projects.map((project) => [
    project.name,
    ...mainOf(project),
    ...project.spaces.map((row) => row.space.id),
  ]);

const bareRepo = '/code/koja/.bare';

const bareWorktree = (id: string, options: SpaceOptions = {}): ListedSpace =>
  listed(id, `/code/koja/${id}`, gitAt(bareRepo, `/code/koja/${id}`, true), options);

describe('groupProjects', () => {
  test('puts linked worktrees without their main checkout under one project', () => {
    const list = [
      bareWorktree('first-worktree'),
      listed('notes', '/home/me/notes', null),
      bareWorktree('second-worktree'),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([
      ['koja', 'first-worktree', 'second-worktree'],
      ['notes', 'notes'],
    ]);
  });

  test('takes the main checkout out of the rows as the main space and names the project after its folder', () => {
    const repo = '/repos/store/upstream.git';

    const list = [
      listed('feature', '/code/herdr-feature', gitAt(repo, '/code/herdr-feature', true)),
      listed('herdr', '/code/herdr', gitAt(repo, '/code/herdr', false)),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([['herdr', 'main herdr', 'feature']]);
  });

  test('keeps a second checkout of the same repository that is not linked as a row', () => {
    const repo = '/code/koja/.git';

    const list = [
      listed('koja', '/code/koja', gitAt(repo, '/code/koja', false)),
      listed('copy', '/code/koja-copy', gitAt(repo, '/code/koja-copy', false)),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([['koja', 'main koja', 'copy']]);
  });

  test('names a project after a bare repository folder when only linked worktrees are open', () => {
    const repo = '/repos/koja.git';

    const list = [
      listed('feature', '/code/feature', gitAt(repo, '/code/feature', true)),
      listed('fix', '/code/fix', gitAt(repo, '/code/fix', true)),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([['koja', 'feature', 'fix']]);
  });

  test('gives a remote project its machine name', () => {
    const remote = { machine: 'build-box' };

    const list = [
      listed('local', '/home/me/local', null),
      listed('remote', '/srv/app', gitAt('/srv/app/.git', '/srv/app', false, 'build-box'), remote),
    ];

    const machines = groupProjects(list, nothingFolded).map((project) => project.machine);

    expect(machines).toEqual([null, 'build-box']);
  });

  test('orders projects by their first space and spaces by the list', () => {
    const repoA = '/code/alpha/.git';
    const repoB = '/code/beta/.git';

    const list = [
      listed('beta-one', '/code/beta-one', gitAt(repoB, '/code/beta-one', true)),
      listed('alpha-one', '/code/alpha-one', gitAt(repoA, '/code/alpha-one', true)),
      listed('beta-two', '/code/beta', gitAt(repoB, '/code/beta', false)),
      listed('alpha-two', '/code/alpha-two', gitAt(repoA, '/code/alpha-two', true)),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([
      ['beta', 'main beta-two', 'beta-one'],
      ['alpha', 'alpha-one', 'alpha-two'],
    ]);
  });

  test('shares one project between spaces in the same folder outside a repository', () => {
    const list = [
      listed('first', '/home/me/notes', null),
      listed('second', '/home/me/notes', null),
      listed('home', '', null),
    ];

    const projects = groupProjects(list, nothingFolded);

    expect(describeProjects(projects)).toEqual([
      ['notes', 'first', 'second'],
      ['home', 'home'],
    ]);
  });

  test('folds a project to its active and waiting spaces and counts the rest', () => {
    const list = [
      bareWorktree('idle'),
      bareWorktree('active', { active: true }),
      bareWorktree('working', { status: 'working' }),
      bareWorktree('blocked', { status: 'blocked' }),
      bareWorktree('done', { status: 'done' }),
    ];

    const key = repositoryOf(null, bareRepo).key;
    const [project] = groupProjects(list, { has: (candidate) => candidate === key });

    expect(project?.folded).toBe(true);
    expect(project?.spaces.map((row) => row.space.id)).toEqual(['active', 'blocked', 'done']);
    expect(project?.hidden).toBe(2);
  });

  test('folding keeps the main space and counts only the other spaces', () => {
    const repo = '/code/koja/.git';

    const list = [
      listed('koja', '/code/koja', gitAt(repo, '/code/koja', false)),
      listed('idle', '/code/idle', gitAt(repo, '/code/idle', true)),
      listed('blocked', '/code/blocked', gitAt(repo, '/code/blocked', true), { status: 'blocked' }),
    ];

    const key = repositoryOf(null, repo).key;
    const [project] = groupProjects(list, { has: (candidate) => candidate === key });

    expect(project?.main?.space.id).toBe('koja');
    expect(project?.spaces.map((row) => row.space.id)).toEqual(['blocked']);
    expect(project?.hidden).toBe(1);
  });

  test('folds a project with a single space', () => {
    const list = [listed('notes', '/home/me/notes', null)];
    const key = placeOf(null, '/home/me/notes').key;

    const [project] = groupProjects(list, { has: (candidate) => candidate === key });

    expect(project?.spaces).toEqual([]);
    expect(project?.hidden).toBe(1);
  });
});

describe('shownSpaces', () => {
  test('lists the main space of a project before its other shown spaces', () => {
    const repo = '/code/koja/.git';

    const list = [
      listed('worktree', '/code/worktree', gitAt(repo, '/code/worktree', true)),
      listed('koja', '/code/koja', gitAt(repo, '/code/koja', false)),
    ];

    const ids = shownSpaces(groupProjects(list, nothingFolded)).map((row) => row.space.id);

    expect(ids).toEqual(['koja', 'worktree']);
  });

  test('lists the shown spaces of every project in order', () => {
    const list = [
      bareWorktree('first'),
      listed('notes', '/home/me/notes', null),
      bareWorktree('second'),
    ];

    const ids = shownSpaces(groupProjects(list, nothingFolded)).map((row) => row.space.id);

    expect(ids).toEqual(['first', 'second', 'notes']);
  });
});

describe('rootSpaceIds', () => {
  test('names the first shown space of each project and skips a project with none', () => {
    const list = [
      bareWorktree('hidden'),
      listed('notes', '/home/me/notes', null),
      listed('later', '/home/me/notes', null),
      listed('site', '/code/site', null),
    ];

    const key = repositoryOf(null, bareRepo).key;

    const projects = groupProjects(list, { has: (candidate) => candidate === key });

    expect(rootSpaceIds(projects)).toEqual(['notes', 'site']);
  });
});
