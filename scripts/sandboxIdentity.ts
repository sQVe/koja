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
  | { kind: 'recordUnreadable'; path: string }
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

type NameHolderOptions = Omit<IdentityOptions, 'window'>;

type NameHolder =
  | { kind: 'free' }
  | { kind: 'held'; checkout: string }
  | { kind: 'unreadableRecord'; path: string };

type RecordRead = InstallRecord | null | 'unreadable';

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

const hashesByPath = (inputs: InstallInput[]): Map<string, string> =>
  new Map(inputs.map((input) => [input.path, input.hash]));

const isFromCheckout = async (checkout: string, origin: InstallOrigin): Promise<boolean> =>
  origin.checkout === (await realpath(checkout));

const changedSinceInstall = async (
  options: IdentityOptions,
  origin: InstallOrigin | null,
): Promise<IdentityFailure[]> => {
  if (origin === null || !(await isFromCheckout(options.checkout, origin))) {
    return [];
  }

  const current = hashesByPath(await shippedInputs(options.checkout));
  const atInstall = hashesByPath(origin.inputs);
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

  if (!(await isFromCheckout(options.checkout, record.origin))) {
    failures.push({ kind: 'otherCheckout', installedFrom: record.origin.checkout });
  }

  if (!record.origin.allChecksPassed) {
    failures.push({ kind: 'checkFailed' });
  }

  return failures;
};

const readRecordOrUnreadable = async (home: string): Promise<RecordRead> => {
  try {
    return await readRecord(home);
  } catch {
    return 'unreadable';
  }
};

const installFailures = async (options: IdentityOptions): Promise<IdentityFailure[]> => {
  const record = await readRecordOrUnreadable(options.home);

  if (record === 'unreadable') {
    return [{ kind: 'recordUnreadable', path: join(options.home, recordName) }];
  }

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

    case 'recordUnreadable': {
      return `cannot read the install record at ${failure.path}`;
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

const findNameHolder = async (options: NameHolderOptions): Promise<NameHolder> => {
  const record = await readRecordOrUnreadable(options.home);

  if (record === 'unreadable') {
    return { kind: 'unreadableRecord', path: join(options.home, recordName) };
  }

  const origin = record?.origin ?? null;

  if (origin === null) {
    return { kind: 'free' };
  }

  if (await isFromCheckout(options.checkout, origin)) {
    return { kind: 'free' };
  }

  // A checkout that no longer exists serves nobody, so its name is free to take over or remove.
  if ((await lstatOrNull(origin.checkout)) === null) {
    return { kind: 'free' };
  }

  return { kind: 'held', checkout: origin.checkout };
};

export const nameHolderReport = async (options: NameHolderOptions): Promise<IdentityReport> => {
  const holder = await findNameHolder(options);

  switch (holder.kind) {
    case 'free': {
      return { exitCode: 0, lines: [] };
    }

    case 'held': {
      return {
        exitCode: 1,
        lines: [
          `sandbox ${options.name} serves ${holder.checkout}, not ${options.checkout}`,
          `use another RUTA_NAME, or run this from ${holder.checkout}`,
        ],
      };
    }

    case 'unreadableRecord': {
      return {
        exitCode: 1,
        lines: [
          `cannot read the install record at ${holder.path}`,
          'remove the sandbox by hand, or restore its record',
        ],
      };
    }

    default: {
      return holder satisfies never;
    }
  }
};

const isWindowState = (value: string | undefined): value is WindowState =>
  windowStates.some((state) => state === value);

const checkedWindowState = (value: string | undefined): WindowState => {
  if (!isWindowState(value)) {
    throw new Error(`The window state must be one of ${windowStates.join(', ')}, not '${value}'`);
  }

  return value;
};

const writeReport = (report: IdentityReport, stream: 'stdout' | 'stderr'): void => {
  const text = report.lines.map((line) => `${line}\n`).join('');

  process[stream].write(text);
  process.exitCode = report.exitCode;
};

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const [name, home, checkout, window] = args;

  if (name === undefined || home === undefined || checkout === undefined) {
    throw new Error(
      'usage: sandboxIdentity.ts <identity|guard> <name> <herdr home> <checkout> [window state]',
    );
  }

  if (command === 'guard') {
    writeReport(await nameHolderReport({ name, home, checkout }), 'stderr');
  } else if (command === 'identity') {
    const state = checkedWindowState(window);

    writeReport(await identityReport({ name, home, checkout, window: state }), 'stdout');
  } else {
    throw new Error(`unknown command '${command}'; use identity or guard`);
  }
}
