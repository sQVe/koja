import type { ExecResult } from 'herdr';

export type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; on: string | null },
) => Promise<ExecResult>;

interface Place {
  machine: string | null;
  folder: string;
  key: string;
}

interface RepositoryIdentity {
  machine: string | null;
  commonDirectory: string;
  key: string;
}

interface WorktreeIdentity {
  machine: string | null;
  top: string;
  key: string;
}

type Branch =
  | { kind: 'named'; name: string }
  | { kind: 'unborn'; name: string }
  | { kind: 'detached' };

interface Checkout {
  place: Place;
  repository: RepositoryIdentity;
  worktree: WorktreeIdentity;
  branch: Branch;
}

export type GitIdentity =
  | ({ kind: 'main' } & Checkout)
  | ({ kind: 'linked' } & Checkout)
  | { kind: 'bare'; place: Place; repository: RepositoryIdentity; branch: Branch }
  | { kind: 'none'; place: Place }
  | { kind: 'failed'; place: Place; error: string };

type Git = (args: string[]) => Promise<ExecResult>;

const keyOf = (machine: string | null, path: string): string => JSON.stringify([machine, path]);

const placeOf = (machine: string | null, folder: string): Place => ({
  machine,
  folder,
  key: keyOf(machine, folder),
});

const repositoryOf = (machine: string | null, commonDirectory: string): RepositoryIdentity => ({
  machine,
  commonDirectory,
  key: keyOf(machine, commonDirectory),
});

const worktreeOf = (machine: string | null, top: string): WorktreeIdentity => ({
  machine,
  top,
  key: keyOf(machine, top),
});

const layoutArgs = [
  'rev-parse',
  '--is-bare-repository',
  '--is-inside-git-dir',
  '--path-format=absolute',
  '--git-dir',
  '--git-common-dir',
];

const describeCommand = (args: string[]): string => `git ${args.join(' ')}`;

const commandFailure = (args: string[], result: ExecResult): Error => {
  const stderr = result.stderr.trim();
  const fallback = `${describeCommand(args)} exited with ${result.code}`;

  return new Error(stderr === '' ? fallback : stderr);
};

const outputOf = (args: string[], result: ExecResult): string => {
  if (result.code !== 0) {
    throw commandFailure(args, result);
  }

  const output = result.stdout.trim();

  if (output === '') {
    throw new Error(`${describeCommand(args)} printed nothing`);
  }

  return output;
};

const parsePath = (line: string | undefined): string => {
  if (line === undefined || line === '') {
    throw new Error(`${describeCommand(layoutArgs)} printed no path`);
  }

  return line;
};

const parseLayout = (output: string) => {
  const [bare, insideGitDirectory, gitDirectory, commonDirectory] = output.split('\n');

  return {
    bare: bare === 'true',
    insideGitDirectory: insideGitDirectory === 'true',
    gitDirectory: parsePath(gitDirectory),
    commonDirectory: parsePath(commonDirectory),
  };
};

type Layout = ReturnType<typeof parseLayout>;

const readLayout = async (git: Git): Promise<Layout | null> => {
  const result = await git(layoutArgs);

  if (result.code !== 0 && /not a git repository/i.test(result.stderr)) {
    return null;
  }

  return parseLayout(outputOf(layoutArgs, result));
};

const readBranch = async (git: Git): Promise<Branch> => {
  const symbolicArgs = ['symbolic-ref', '--quiet', '--short', 'HEAD'];
  const symbolic = await git(symbolicArgs);

  if (symbolic.code === 1) {
    return { kind: 'detached' };
  }

  const name = outputOf(symbolicArgs, symbolic);
  const commitArgs = ['rev-parse', '--verify', '--quiet', 'HEAD'];
  const commit = await git(commitArgs);

  if (commit.code === 1) {
    return { kind: 'unborn', name };
  }

  if (commit.code !== 0) {
    throw commandFailure(commitArgs, commit);
  }

  return { kind: 'named', name };
};

const readIdentity = async (git: Git, place: Place): Promise<GitIdentity> => {
  const layout = await readLayout(git);

  if (layout === null) {
    return { kind: 'none', place };
  }

  const repository = repositoryOf(place.machine, layout.commonDirectory);

  if (layout.bare) {
    return { kind: 'bare', place, repository, branch: await readBranch(git) };
  }

  if (layout.insideGitDirectory) {
    return { kind: 'none', place };
  }

  const topArgs = ['rev-parse', '--show-toplevel'];
  const top = outputOf(topArgs, await git(topArgs));
  const worktree = worktreeOf(place.machine, top);
  const branch = await readBranch(git);
  const kind = layout.gitDirectory === layout.commonDirectory ? 'main' : 'linked';

  return { kind, place, repository, worktree, branch };
};

export const readGitIdentity = async (
  run: RunCommand,
  machine: string | null,
  folder: string,
): Promise<GitIdentity> => {
  const place = placeOf(machine, folder);
  const git: Git = (args) => run('git', args, { cwd: folder, on: machine });

  try {
    return await readIdentity(git, place);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { kind: 'failed', place, error: message };
  }
};
