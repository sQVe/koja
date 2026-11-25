import type { RunCommand } from './gitIdentity.ts';
import type { PullSource } from './pullSources.ts';

export interface PullRemote {
  host: string;
  owner: string;
  repository: string;
}

export type RemoteRead =
  | { kind: 'remote'; remote: PullRemote | null }
  | { kind: 'failed' }
  | { kind: 'dropped' };

export const remoteNamesOf = (remotes: string): string[] =>
  remotes
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');

export const remoteNameOf = (names: string[], marked: string | null): string | null => {
  if (marked !== null && names.includes(marked)) {
    return marked;
  }

  if (names.includes('origin')) {
    return 'origin';
  }

  return names[0] ?? null;
};

// gh records its default repository as remote.<name>.gh-resolved, and reads it back with this key.
export const ghResolvedConfigKey = '^remote\\..*\\.gh-resolved$';

const ghResolvedLine = /^remote\.(.+)\.gh-resolved(?: |$)/m;

export const markedRemoteOf = (config: string): string | null => {
  const match = ghResolvedLine.exec(config);

  return match?.[1] ?? null;
};

const withoutGitSuffix = (name: string): string => name.replace(/\.git$/, '');

const decodedComponent = (component: string): string | null => {
  try {
    return decodeURIComponent(component);
  } catch {
    return null;
  }
};

const remotePathOf = (path: string): Pick<PullRemote, 'owner' | 'repository'> | null => {
  const parts = path.split('/').filter((part) => part !== '');

  if (parts.length !== 2) {
    return null;
  }

  const [ownerPart, repositoryPart] = parts;

  if (ownerPart === undefined || repositoryPart === undefined) {
    return null;
  }

  const owner = decodedComponent(ownerPart);
  const repository = decodedComponent(repositoryPart);

  if (owner === null || repository === null) {
    return null;
  }

  return { owner: withoutGitSuffix(owner), repository: withoutGitSuffix(repository) };
};

// GitHub serves SSH over 443 at ssh.github.com, but its API is at github.com.
const apiHostOf = (host: string): string => (host === 'ssh.github.com' ? 'github.com' : host);

export const remoteOfUrl = (remoteUrl: string): PullRemote | null => {
  const url = remoteUrl.trim();
  const shorthand = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(url);
  const uri = /^(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?\/(.+)$/.exec(url);
  const match = shorthand ?? uri;

  if (match === null) {
    return null;
  }

  const host = match[1];
  const path = match[2];
  const parts = path === undefined ? null : remotePathOf(path);

  if (host === undefined || parts === null) {
    return null;
  }

  return { host: apiHostOf(host), ...parts };
};

export const remoteLookup = async (
  run: RunCommand,
  source: PullSource,
  remote: string,
  stillOwner: () => boolean,
): Promise<RemoteRead> => {
  const result = await run('git', ['remote', 'get-url', remote], {
    cwd: source.cwd,
    on: source.repository.machine,
  });

  if (result.code !== 0) {
    return { kind: 'failed' };
  }

  if (!stillOwner()) {
    return { kind: 'dropped' };
  }

  return { kind: 'remote', remote: remoteOfUrl(result.stdout) };
};
