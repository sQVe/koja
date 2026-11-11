import { readdir, realpath, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { isMissing } from './build.ts';
import type { InstallRecord } from './install.ts';
import { filesUnder, isSameFile, lstatOrNull, readRecord, recordName } from './install.ts';

type WindowState = 'answers' | 'silent' | 'notUp';

export interface IdentityOptions {
  name: string;
  home: string;
  checkout: string;
  window: WindowState;
}

export type IdentityFailure =
  | { kind: 'sandboxNotUp' }
  | { kind: 'windowSilent' }
  | { kind: 'recordMissing' }
  | { kind: 'recordWithoutOrigin' }
  | { kind: 'otherCheckout'; installedFrom: string }
  | { kind: 'checkFailed' }
  | { kind: 'notInstalled'; path: string }
  | { kind: 'differs'; path: string }
  | { kind: 'noSource'; path: string }
  | { kind: 'changedSinceInstall'; path: string };

export interface IdentityReport {
  exitCode: 0 | 1;
  lines: string[];
}

const windowStates: WindowState[] = ['answers', 'silent', 'notUp'];

const shippedFolders = ['src', 'config'];

const shippedFiles = ['scripts/build.ts', 'scripts/install.ts', 'package.json', 'bun.lock'];

// Pairs of the path inside Herdr home and the path inside the checkout, as the installer plans them.
const sourcesByInstalledPath = async (checkout: string): Promise<Map<string, string>> => {
  const sources = new Map<string, string>();

  for (const file of await filesUnder(join(checkout, 'config'))) {
    sources.set(file, join('config', file));
  }

  for (const file of await filesUnder(join(checkout, 'dist', 'mods'))) {
    sources.set(join('mods', file), join('dist', 'mods', file));
  }

  return sources;
};

const copyFailure = async (
  options: IdentityOptions,
  installed: string,
  source: string,
): Promise<IdentityFailure | null> => {
  const destination = join(options.home, installed);

  if ((await lstatOrNull(destination)) === null) {
    return { kind: 'notInstalled', path: source };
  }

  const same = await isSameFile(join(options.checkout, source), destination);

  return same ? null : { kind: 'differs', path: source };
};

const copyFailures = async (
  options: IdentityOptions,
  sources: Map<string, string>,
): Promise<IdentityFailure[]> => {
  const failures = await Promise.all(
    [...sources].map(async ([installed, source]) => copyFailure(options, installed, source)),
  );

  return failures.filter((failure) => failure !== null);
};

const isTest = (path: string): boolean => path.endsWith('.test.ts');

const foldersUnder = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
  }
};

// A deleted file has no modification time left to compare, but deleting, adding, or renaming a
// file changes the modification time of its folder. So each folder counts as an input too.
const shippedInputs = async (checkout: string): Promise<string[]> => {
  const inFolders = await Promise.all(
    shippedFolders.map(async (folder) => {
      const root = join(checkout, folder);
      const [files, folders] = await Promise.all([filesUnder(root), foldersUnder(root)]);
      const shipped = files.filter((file) => !isTest(file));
      const inside = shipped.concat(folders).map((path) => join(folder, path));

      return [folder].concat(inside);
    }),
  );

  return [...inFolders.flat(), ...shippedFiles];
};

const modifiedAt = async (path: string): Promise<number | null> => {
  try {
    const entry = await stat(path);

    return entry.mtimeMs;
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
};

const changedSinceInstall = async (options: IdentityOptions): Promise<IdentityFailure[]> => {
  const installedAt = await modifiedAt(join(options.home, recordName));
  const inputs = await shippedInputs(options.checkout);

  const changed = await Promise.all(
    inputs.map(async (path) => {
      const inputAt = await modifiedAt(join(options.checkout, path));

      return inputAt !== null && installedAt !== null && inputAt > installedAt;
    }),
  );

  return inputs
    .filter((_, index) => changed[index] === true)
    .map((path) => ({ kind: 'changedSinceInstall', path }));
};

const originFailures = async (
  options: IdentityOptions,
  record: InstallRecord,
): Promise<IdentityFailure[]> => {
  if (record.origin === null) {
    return [{ kind: 'recordWithoutOrigin' }];
  }

  const failures: IdentityFailure[] = [];

  if (record.origin.checkout !== (await realpath(options.checkout))) {
    failures.push({ kind: 'otherCheckout', installedFrom: record.origin.checkout });
  }

  if (!record.origin.allChecksPassed) {
    failures.push({ kind: 'checkFailed' });
  }

  return failures;
};

const installFailures = async (options: IdentityOptions): Promise<IdentityFailure[]> => {
  const record = await readRecord(options.home);

  if (record === null) {
    return [{ kind: 'recordMissing' }];
  }

  const sources = await sourcesByInstalledPath(options.checkout);

  const withoutSource = record.files
    .filter((path) => !sources.has(path))
    .map((path): IdentityFailure => ({ kind: 'noSource', path }));

  return [
    ...(await originFailures(options, record)),
    ...(await copyFailures(options, sources)),
    ...withoutSource,
    ...(await changedSinceInstall(options)),
  ];
};

export const findIdentityFailures = async (
  options: IdentityOptions,
): Promise<IdentityFailure[]> => {
  if (options.window === 'notUp') {
    return [{ kind: 'sandboxNotUp' }];
  }

  const failures = await installFailures(options);

  return options.window === 'silent' ? [{ kind: 'windowSilent' }, ...failures] : failures;
};

const failureLine = (options: IdentityOptions, failure: IdentityFailure): string => {
  switch (failure.kind) {
    case 'sandboxNotUp': {
      return `sandbox ${options.name} is not up`;
    }

    case 'windowSilent': {
      return `the window of sandbox ${options.name} does not answer`;
    }

    case 'recordMissing': {
      return `no install record at ${join(options.home, recordName)}`;
    }

    case 'recordWithoutOrigin': {
      return `the install record at ${join(options.home, recordName)} names no checkout and no check result`;
    }

    case 'otherCheckout': {
      return `installed from ${failure.installedFrom}, not from ${options.checkout}`;
    }

    case 'checkFailed': {
      return 'a mod check failed in the last install';
    }

    case 'notInstalled': {
      return `not installed: ${failure.path}`;
    }

    case 'differs': {
      return `differs from the installed copy: ${failure.path}`;
    }

    case 'noSource': {
      return `installed, but not in this checkout: ${failure.path}`;
    }

    case 'changedSinceInstall': {
      return `changed after the last install: ${failure.path}`;
    }

    default: {
      return failure satisfies never;
    }
  }
};

export const identityReport = async (options: IdentityOptions): Promise<IdentityReport> => {
  const failures = await findIdentityFailures(options);

  if (failures.length === 0) {
    return { exitCode: 0, lines: [`sandbox ${options.name} serves ${options.checkout}`] };
  }

  return { exitCode: 1, lines: failures.map((failure) => failureLine(options, failure)) };
};

const isWindowState = (value: string | undefined): value is WindowState =>
  windowStates.some((state) => state === value);

if (import.meta.main) {
  const [name, home, checkout, window] = process.argv.slice(2);

  if (name === undefined || home === undefined || checkout === undefined) {
    throw new Error('usage: sandboxIdentity.ts <name> <herdr home> <checkout> <window state>');
  }

  if (!isWindowState(window)) {
    throw new Error(`The window state must be one of ${windowStates.join(', ')}, not '${window}'`);
  }

  const report = await identityReport({ name, home, checkout, window });

  process.stdout.write(`${report.lines.join('\n')}\n`);
  process.exitCode = report.exitCode;
}
