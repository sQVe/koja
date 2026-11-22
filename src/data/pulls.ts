import { hasOnlyKeys, isRecord, listOf, numberOf, recordOf, stringOf } from '../kit/fields.ts';
import type { RepositoryIdentity, RunCommand } from './gitIdentity.ts';

export interface Pull {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  headRefName: string;
}

export type PullRead = { kind: 'read'; pulls: Pull[] } | { kind: 'failed' } | { kind: 'dropped' };

const pullFieldNames = ['number', 'state', 'isDraft', 'title', 'headRefName'];

const pullFields = pullFieldNames.join(',');

const decodePull = (fields: Record<string, unknown>): Pull | null => {
  const number = numberOf(fields['number']);
  const state = stringOf(fields['state']);
  const isDraft = fields['isDraft'];
  const title = stringOf(fields['title']);
  const headRefName = stringOf(fields['headRefName']);

  if (number === null) {
    return null;
  }

  if (state === null) {
    return null;
  }

  if (typeof isDraft !== 'boolean') {
    return null;
  }

  if (title === null) {
    return null;
  }

  if (headRefName === null) {
    return null;
  }

  return { number, state, isDraft, title, headRefName };
};

export const parseStoredPull = (value: unknown): Pull | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasOnlyKeys(value, pullFieldNames)) {
    return null;
  }

  return decodePull(value);
};

const decodeCommandPull = (value: unknown): Pull | null => {
  const fields = recordOf(value);

  return decodePull({
    ...fields,
    title: stringOf(fields['title']) ?? '',
    isDraft: fields['isDraft'] === true,
  });
};

export const readPullList = (value: unknown): Pull[] =>
  listOf(value)
    .map(decodeCommandPull)
    .filter((pull): pull is Pull => pull !== null);

export const readRepositoryPulls = async (
  run: RunCommand,
  repository: RepositoryIdentity,
  cwd: string,
  stillOwner: () => boolean,
): Promise<PullRead> => {
  try {
    const remotes = await run('git', ['remote'], { cwd, on: repository.machine });

    if (remotes.code !== 0) {
      return { kind: 'failed' };
    }

    if (!stillOwner()) {
      return { kind: 'dropped' };
    }

    if (remotes.stdout.trim() === '') {
      return { kind: 'read', pulls: [] };
    }

    const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
    const result = await run('gh', args, { cwd, on: repository.machine });

    if (result.code !== 0) {
      return { kind: 'failed' };
    }

    const value: unknown = JSON.parse(result.stdout);

    if (!Array.isArray(value)) {
      return { kind: 'failed' };
    }

    const pulls = readPullList(value);

    if (value.length > 0 && pulls.length === 0) {
      return { kind: 'failed' };
    }

    return { kind: 'read', pulls };
  } catch {
    return { kind: 'failed' };
  }
};
