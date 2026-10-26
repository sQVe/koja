import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

export interface Revision {
  head: string;
  runtimeRevision: string;
  treeHashes: Record<string, string>;
  dirty: boolean;
  packageJsonDigest: string;
}

export const runtimePaths = ['src', 'patches', 'scripts/buildVt.sh', 'bun.lock'] as const;

const porcelainStatusLength = 3;

const runtimeTreePaths = [
  ['src', 'HEAD:src'],
  ['patches', 'HEAD:patches'],
  ['buildVt', 'HEAD:scripts/buildVt.sh'],
  ['bunLock', 'HEAD:bun.lock'],
] as const;

const git = (directory: string, args: string[]): string | undefined => {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: directory,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    return undefined;
  }

  return new TextDecoder().decode(result.stdout);
};

const requiredGit = (directory: string, args: string[]): string => {
  const text = git(directory, args)?.trim();

  if (text === undefined || text === '') {
    throw new Error(`git ${args.join(' ')} failed in ${directory}.`);
  }

  return text;
};

export const dirtyRuntimePaths = (directory: string): string[] => {
  const status = git(directory, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...runtimePaths,
  ]);

  if (status === undefined) {
    return ['git status failed, so the runtime paths cannot be checked'];
  }

  return status
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(porcelainStatusLength).trim());
};

const packageSchema = z.object({
  dependencies: z.unknown(),
  devDependencies: z.unknown(),
  overrides: z.unknown(),
});

const packageJsonDigest = (directory: string): string => {
  const parsed = packageSchema.parse(
    JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')),
  );

  const runtimeDependencies = {
    dependencies: parsed.dependencies,
    devDependencies: parsed.devDependencies,
    overrides: parsed.overrides,
  };

  return createHash('sha256').update(JSON.stringify(runtimeDependencies)).digest('hex');
};

export const readRevision = (directory: string): Revision => {
  const treeHashes: Record<string, string> = {};

  for (const [name, specifier] of runtimeTreePaths) {
    const hash = git(directory, ['rev-parse', specifier])?.trim();

    if (hash !== undefined) {
      treeHashes[name] = hash;
    }
  }

  return {
    head: requiredGit(directory, ['rev-parse', 'HEAD']),
    runtimeRevision: requiredGit(directory, ['log', '-1', '--format=%H', '--', ...runtimePaths]),
    treeHashes,
    dirty: dirtyRuntimePaths(directory).length > 0,
    packageJsonDigest: packageJsonDigest(directory),
  };
};
