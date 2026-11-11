import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import type { InstallInput, InstallOrigin, InstallRecord } from './install.ts';
import {
  filesUnder,
  isSameFile,
  lstatOrNull,
  readRecord,
  recordName,
  shippedInputs,
} from './install.ts';

type WindowState = 'answers' | 'silent';

export interface IdentityOptions {
  name: string;
  home: string;
  checkout: string;
  window: WindowState;
}

export type IdentityFailure =
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

const windowStates: WindowState[] = ['answers', 'silent'];

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

const timesByPath = (inputs: InstallInput[]): Map<string, number> =>
  new Map(inputs.map((input) => [input.path, input.modifiedAt]));

const isFromCheckout = async (options: IdentityOptions, origin: InstallOrigin): Promise<boolean> =>
  origin.checkout === (await realpath(options.checkout));

const changedSinceInstall = async (
  options: IdentityOptions,
  origin: InstallOrigin | null,
): Promise<IdentityFailure[]> => {
  if (origin === null || !(await isFromCheckout(options, origin))) {
    return [];
  }

  const current = timesByPath(await shippedInputs(options.checkout));
  const atInstall = timesByPath(origin.inputs);
  const paths = [...new Set([...atInstall.keys(), ...current.keys()])].toSorted();

  return paths
    .filter((path) => atInstall.get(path) !== current.get(path))
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

  if (!(await isFromCheckout(options, record.origin))) {
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
    ...(await changedSinceInstall(options, record.origin)),
  ];
};

export const findIdentityFailures = async (
  options: IdentityOptions,
): Promise<IdentityFailure[]> => {
  const failures = await installFailures(options);

  return options.window === 'silent' ? [{ kind: 'windowSilent' }, ...failures] : failures;
};

const failureLine = (options: IdentityOptions, failure: IdentityFailure): string => {
  switch (failure.kind) {
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
    return {
      exitCode: 0,
      lines: [`sandbox ${options.name} has the current mods and config of ${options.checkout}`],
    };
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
