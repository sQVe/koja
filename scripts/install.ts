import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { constants, watch } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { buildMods, isMissing, outputDirectory, sourceDirectory } from './build.ts';
import { acquireCheckoutLock } from './checkoutLock.ts';

export interface CheckResult {
  passed: boolean;
  output: string;
}

export interface InstallRoots {
  userHome: string;
  temporary: string;
}

export interface InstallInput {
  path: string;
  hash: string;
}

export interface InstallOptions {
  home: string;
  checkout: string;
  // Read before the build starts, so a change made during the build or the install shows later.
  inputs: InstallInput[];
  modsDirectory: string;
  configDirectory: string;
  check: (modFolder: string) => Promise<CheckResult>;
  roots?: InstallRoots;
  chmodFile?: (path: string, mode: number) => Promise<void>;
  lockTimeoutMilliseconds?: number;
  temporaryRecordName?: () => string;
  writeRecordFile?: (path: string, text: string) => Promise<void>;
  removeStaging?: (path: string) => Promise<void>;
  onCheckoutLockWait?: (() => void) | undefined;
  checkoutLockHeld?: boolean | undefined;
}

export interface InstallResult {
  written: string[];
  removed: string[];
  checks: (CheckResult & { mod: string })[];
}

export interface InstallOrigin {
  checkout: string;
  allChecksPassed: boolean;
  completed: boolean;
  inputs: InstallInput[];
}

export interface InstallRecord {
  files: string[];
  // Kept apart from the origin: a record from an older version names its checkout but has no input
  // hashes, so the origin is dropped while the checkout still holds.
  checkout: string | null;
  origin: InstallOrigin | null;
}

type RecordFields = Record<string, unknown>;

interface InstallProgress {
  written: string[];
  removed: string[];
  checks: InstallResult['checks'];
  applied: boolean;
  staging: string | null;
}

type AncestorResolution = 'missing' | 'directory' | 'removed';

export const recordName = '.koja-install.json';

export const recordPath = (home: string): string => join(home, recordName);

const lockName = '.koja-install.lock';

const stagingPrefix = '.koja-check-';

const lockRetryMilliseconds = 25;

const lockTimeoutMilliseconds = 30_000;

const recordVersion = 3;

const commonRecordFields = new Set(['version', 'checkout', 'allChecksPassed', 'inputs', 'files']);

const permissionBits = 0o777;

const watchDebounceMilliseconds = 200;

const isNotDirectory = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOTDIR';

export const lstatOrNull = async (path: string): Promise<Stats | null> =>
  lstat(path).catch((error: unknown) => {
    if (isMissing(error) || isNotDirectory(error)) {
      return null;
    }

    throw error;
  });

export const filesUnder = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });

    // A folder listing has no stable order, so callers would see another order on another machine.
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
      .toSorted();
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
  }
};

const leavesUnder = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .toSorted();
};

const shippedFolders = ['src', 'config'];

const shippedFiles = [
  'scripts/build.ts',
  'scripts/checkoutLock.ts',
  'scripts/install.ts',
  'package.json',
  'bun.lock',
];

const isTest = (path: string): boolean => path.endsWith('.test.ts');

const shippedPaths = async (checkout: string): Promise<string[]> => {
  const inFolders = await Promise.all(
    shippedFolders.map(async (folder) => {
      const files = await filesUnder(join(checkout, folder));

      return files.filter((file) => !isTest(file)).map((file) => join(folder, file));
    }),
  );

  return [...inFolders.flat(), ...shippedFiles];
};

const contentHash = async (path: string): Promise<string | null> => {
  try {
    const content = await readFile(path);

    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
};

export const shippedInputs = async (checkout: string): Promise<InstallInput[]> => {
  const paths = await shippedPaths(checkout);
  const hashes = await Promise.all(paths.map(async (path) => contentHash(join(checkout, path))));
  const inputs: InstallInput[] = [];

  for (const [index, path] of paths.entries()) {
    const hash = hashes[index];

    if (hash !== null && hash !== undefined) {
      inputs.push({ path, hash });
    }
  }

  return inputs;
};

const isInstallerMetadata = (path: string): boolean => {
  const [top] = path.split(sep);

  const recordMetadata =
    path === recordName ||
    path.startsWith(`${recordName}${sep}`) ||
    path.startsWith(`${recordName}.`);

  const lockMetadata = path === lockName || path.startsWith(`${lockName}${sep}`);

  const stagingMetadata = top?.startsWith(stagingPrefix) === true;

  return recordMetadata || lockMetadata || stagingMetadata;
};

const assertBuiltMods = async (directory: string): Promise<void> => {
  try {
    const details = await stat(directory);

    if (!details.isDirectory()) {
      throw new Error(
        `Refusing to install because the built mods path ${directory} is not a directory`,
      );
    }
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(
        `Refusing to install because the built mods are missing at ${directory}. Run bun run build first.`,
        { cause: error },
      );
    }

    throw error;
  }
};

const plannedFiles = async (options: InstallOptions): Promise<Map<string, string>> => {
  const planned = new Map<string, string>();

  await assertBuiltMods(options.modsDirectory);

  for (const file of await filesUnder(options.configDirectory)) {
    planned.set(file, join(options.configDirectory, file));
  }

  for (const file of await filesUnder(options.modsDirectory)) {
    planned.set(join('mods', file), join(options.modsDirectory, file));
  }

  for (const path of planned.keys()) {
    if (isInstallerMetadata(path)) {
      throw new Error(`Refusing to install reserved installer path ${JSON.stringify(path)}`);
    }
  }

  return planned;
};

const isRecordFields = (value: unknown): value is RecordFields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidRecordEntry = (reason: string, file: string): Error =>
  new Error(`Refusing install record entry ${JSON.stringify(file)}: ${reason}`);

const canonicalRecordPath = (path: string): string => {
  const normalized = normalize(path);

  return normalized.endsWith(sep) ? normalized.slice(0, -sep.length) : normalized;
};

const recordedPath = (file: string): string | null => {
  if (file === '') {
    throw invalidRecordEntry('the path is empty', file);
  }

  const normalized = normalize(file);

  if (isAbsolute(normalized)) {
    return null;
  }

  const escapes = normalized === '..' || normalized.startsWith(`..${sep}`);

  if (escapes) {
    return null;
  }

  const canonical = canonicalRecordPath(normalized);

  if (canonical === '.' || canonical === '') {
    throw invalidRecordEntry('the path names Herdr home itself', file);
  }

  if (isInstallerMetadata(canonical)) {
    throw invalidRecordEntry('the path is reserved for installer metadata', file);
  }

  if (canonical !== file) {
    throw invalidRecordEntry('the path is not canonical', file);
  }

  return canonical;
};

const recordedFiles = (record: RecordFields): string[] => {
  const { files } = record;

  if (!Array.isArray(files)) {
    return [];
  }

  const recorded: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (typeof file !== 'string') {
      continue;
    }

    const canonical = recordedPath(file);

    if (canonical === null) {
      continue;
    }

    if (seen.has(canonical)) {
      throw invalidRecordEntry('the path appears more than once', file);
    }

    seen.add(canonical);
    recorded.push(canonical);
  }

  return recorded;
};

const isInstallInput = (value: unknown): value is InstallInput => {
  if (!isRecordFields(value)) {
    return false;
  }

  return typeof value['path'] === 'string' && typeof value['hash'] === 'string';
};

const isInstallInputs = (value: unknown): value is InstallInput[] =>
  Array.isArray(value) && value.every(isInstallInput);

const assertCurrentRecord = (record: RecordFields): void => {
  const problems: string[] = [];

  if (typeof record['checkout'] !== 'string') {
    problems.push('checkout');
  }

  if (typeof record['allChecksPassed'] !== 'boolean') {
    problems.push('allChecksPassed');
  }

  if (typeof record['completed'] !== 'boolean') {
    problems.push('completed');
  }

  if (
    !Array.isArray(record['files']) ||
    !record['files'].every((file) => typeof file === 'string')
  ) {
    problems.push('files');
  }

  if (!isInstallInputs(record['inputs'])) {
    problems.push('inputs');
  }

  if (problems.length > 0) {
    throw new Error(
      `The install record of version ${recordVersion} is malformed: ${problems.join(', ')}`,
    );
  }
};

const recordedCheckout = (record: RecordFields): string | null => {
  const { checkout } = record;

  return typeof checkout === 'string' && isAbsolute(checkout) ? checkout : null;
};

const recordedOrigin = (
  record: RecordFields,
  checkout: string | null,
  version: number,
): InstallOrigin | null => {
  const { allChecksPassed, completed, inputs } = record;

  if (checkout === null || typeof allChecksPassed !== 'boolean') {
    return null;
  }

  if (!isInstallInputs(inputs)) {
    return null;
  }

  if (version < recordVersion) {
    return { checkout, allChecksPassed, completed: false, inputs };
  }

  if (typeof completed !== 'boolean') {
    return null;
  }

  return { checkout, allChecksPassed, completed, inputs };
};

const recordVersionOf = (record: RecordFields): number => {
  const version = record['version'];

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('The install record has no valid version');
  }

  if (version > recordVersion) {
    throw new Error(
      `The install record has version ${version}, newer than supported version ${recordVersion}. Update Koja or remove the record and install again.`,
    );
  }

  return version;
};

const assertRecordFields = (record: RecordFields, version: number): void => {
  for (const field of Object.keys(record)) {
    const currentOnly = version === recordVersion && field === 'completed';
    const known = commonRecordFields.has(field) || currentOnly;

    if (!known) {
      throw new Error(
        `The install record of version ${version} has unknown field ${JSON.stringify(field)}`,
      );
    }
  }
};

export const readRecord = async (home: string): Promise<InstallRecord | null> => {
  const path = recordPath(home);
  const existing = await lstatOrNull(path);

  if (existing === null || existing.isSymbolicLink()) {
    return null;
  }

  try {
    const record: unknown = JSON.parse(await readFile(path, 'utf8'));

    if (!isRecordFields(record)) {
      return { files: [], checkout: null, origin: null };
    }

    const version = recordVersionOf(record);

    assertRecordFields(record, version);

    if (version === recordVersion) {
      assertCurrentRecord(record);
    }

    const checkout = recordedCheckout(record);

    return {
      files: recordedFiles(record),
      checkout,
      origin: recordedOrigin(record, checkout, version),
    };
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
};

const isInside = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}${sep}`);

// /home and /var can be symlinks on some systems, so start at a root the user controls.
// The user's home wins over a temporary folder nested inside it, so a linked ancestor
// between the two is still checked.
export const trustedRoot = (home: string, userHome: string, temporary: string): string => {
  if (isInside(home, userHome)) {
    return userHome;
  }

  return isInside(home, temporary) ? temporary : parse(home).root;
};

const pathChain = (root: string, path: string): string[] => {
  const parts = relative(root, path)
    .split(sep)
    .filter((piece) => piece !== '');

  const chain = [root];
  let folder = root;

  for (const part of parts) {
    folder = join(folder, part);
    chain.push(folder);
  }

  return chain;
};

const refuseLinkedHome = async (home: string, roots: InstallRoots): Promise<void> => {
  const root = trustedRoot(home, roots.userHome, roots.temporary);

  for (const folder of pathChain(root, home)) {
    // eslint-disable-next-line no-await-in-loop -- each folder is checked before the next one under it
    const entry = await lstatOrNull(folder);

    if (entry?.isSymbolicLink() === true) {
      const where =
        folder === home
          ? `the symlinked Herdr home ${home}`
          : `the symlinked folder ${folder} on the path from ${root} to Herdr home ${home}`;

      throw new Error(`Refusing to install into ${where}`);
    }
  }
};

const refuseLinkedFolders = async (home: string, path: string): Promise<void> => {
  let folder = home;

  for (const part of dirname(path)
    .split(sep)
    .filter((piece) => piece !== '.')) {
    folder = join(folder, part);

    // eslint-disable-next-line no-await-in-loop -- each folder is checked before the next one under it
    const entry = await lstatOrNull(folder);

    if (entry?.isSymbolicLink() === true) {
      throw new Error(`Refusing to install through the symlinked folder ${folder}`);
    }
  }
};

const removeSymlinkLeaf = async (destination: string): Promise<void> => {
  const existing = await lstatOrNull(destination);

  if (existing?.isSymbolicLink() === true) {
    await unlink(destination);
  }
};

export const isSameFile = async (source: string, destination: string): Promise<boolean> => {
  const [sourceStat, destinationStat] = await Promise.all([stat(source), lstat(destination)]);
  const sameMode = (sourceStat.mode & permissionBits) === (destinationStat.mode & permissionBits);

  if (!destinationStat.isFile() || !sameMode) {
    return false;
  }

  const [sourceText, destinationText] = await Promise.all([
    readFile(source),
    readFile(destination),
  ]);

  return sourceText.equals(destinationText);
};

const temporaryName = (path: string): string => `.${basename(path)}.koja-${randomUUID()}.tmp`;

const installFile = async (
  home: string,
  path: string,
  source: string,
  chmodFile: (path: string, mode: number) => Promise<void>,
  onWritten: (path: string) => void,
): Promise<boolean> => {
  const destination = join(home, path);

  await removeSymlinkLeaf(destination);

  const existing = await lstatOrNull(destination);

  if (existing !== null && (await isSameFile(source, destination))) {
    return false;
  }

  const sourceStat = await stat(source);
  const folder = dirname(destination);
  const temporaryPath = join(folder, temporaryName(destination));

  await mkdir(folder, { recursive: true });

  try {
    await copyFile(source, temporaryPath, constants.COPYFILE_EXCL);
    await chmodFile(temporaryPath, sourceStat.mode & permissionBits);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    throw error;
  }

  onWritten(path);

  return true;
};

const removeEmptyFolder = async (folder: string): Promise<boolean> => {
  const entries = await readdir(folder).catch(() => null);

  if (entries === null || entries.length > 0) {
    return false;
  }

  await rmdir(folder);

  return true;
};

const removeEmptyFolders = async (home: string, path: string): Promise<void> => {
  let folder = dirname(join(home, path));

  while (folder !== home && folder.startsWith(home)) {
    // eslint-disable-next-line no-await-in-loop -- a parent can only be empty once its child is gone
    if (!(await removeEmptyFolder(folder))) {
      return;
    }

    folder = dirname(folder);
  }
};

const removeFile = async (home: string, path: string): Promise<boolean> => {
  const destination = join(home, path);
  const existing = await lstatOrNull(destination);

  if (existing === null || existing.isDirectory()) {
    return false;
  }

  await unlink(destination);
  await removeEmptyFolders(home, path);

  return true;
};

const installedMods = (paths: Iterable<string>): string[] => {
  const mods = new Set<string>();

  for (const path of paths) {
    const [top, mod] = path.split(sep);

    if (top === 'mods' && mod !== undefined) {
      mods.add(mod);
    }
  }

  return [...mods].toSorted();
};

const byPath = (first: InstallInput, second: InstallInput): number => {
  if (first.path === second.path) {
    return 0;
  }

  return first.path < second.path ? -1 : 1;
};

const isAlreadyExists = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'EEXIST';

const createInstallLock = async (lockPath: string): Promise<void> => {
  const handle = await open(lockPath, 'wx');

  await handle.close();
};

const acquireInstallLock = async (
  home: string,
  timeoutMilliseconds: number,
): Promise<() => Promise<void>> => {
  const lockPath = join(home, lockName);
  const deadline = Date.now() + timeoutMilliseconds;

  await removeSymlinkLeaf(lockPath);

  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop -- the lock is tried once before a wait
      await createInstallLock(lockPath);

      return async () => {
        await unlink(lockPath).catch((error: unknown) => {
          if (!isMissing(error)) {
            throw error;
          }
        });
      };
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for the install lock ${lockPath}. Stop other installs for this home, check that no installer holds the lock, then remove only ${lockPath} and retry.`,
          { cause: error },
        );
      }

      // eslint-disable-next-line no-await-in-loop -- a held lock is retried after a wait
      await delay(lockRetryMilliseconds);
    }
  }
};

const acquireInstallLocks = async (
  home: string,
  options: InstallOptions,
): Promise<() => Promise<void>> => {
  const releaseCheckout = await acquireCheckoutLock(options.checkout, {
    held: options.checkoutLockHeld,
    onWait: options.onCheckoutLockWait,
  });

  try {
    const releaseInstall = await acquireInstallLock(
      home,
      options.lockTimeoutMilliseconds ?? lockTimeoutMilliseconds,
    );

    return async () => {
      await releaseInstall();
      await releaseCheckout();
    };
  } catch (error) {
    await releaseCheckout();

    throw error;
  }
};

const writeRecord = async (
  home: string,
  files: string[],
  origin: InstallOrigin,
  recordTemporaryName: string,
  writeFileTo: (path: string, text: string) => Promise<void>,
): Promise<void> => {
  const record = {
    version: recordVersion,
    checkout: origin.checkout,
    allChecksPassed: origin.allChecksPassed,
    completed: origin.completed,
    inputs: origin.inputs.toSorted(byPath),
    files: files.toSorted(),
  };

  const path = recordPath(home);
  const temporaryPath = join(home, recordTemporaryName);

  try {
    await writeFileTo(temporaryPath, `${JSON.stringify(record, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    throw error;
  }
};

const isModFile = (path: string): boolean => path.split(sep)[0] === 'mods';

const installFiles = async (
  home: string,
  files: [string, string][],
  chmodFile: (path: string, mode: number) => Promise<void>,
  onWritten: (path: string) => void,
  sourceRoot?: string,
): Promise<string[]> => {
  const written: string[] = [];

  for (const [path, source] of files) {
    const from = sourceRoot === undefined ? source : join(sourceRoot, path);

    // eslint-disable-next-line no-await-in-loop -- files are written one at a time, in order
    if (await installFile(home, path, from, chmodFile, onWritten)) {
      written.push(path);
    }
  }

  return written;
};

const removeStale = async (
  home: string,
  stale: string[],
  owned: Set<string>,
): Promise<string[]> => {
  const removed: string[] = [];

  for (const path of stale) {
    // eslint-disable-next-line no-await-in-loop -- removals go one at a time, so empty folders go too
    if (await removeFile(home, path)) {
      removed.push(path);
    }

    owned.delete(path);
  }

  return removed;
};

const checkMods = async (
  home: string,
  planned: Map<string, string>,
  check: InstallOptions['check'],
): Promise<InstallResult['checks']> => {
  const mods = installedMods(planned.keys());

  const checkMod = async (mod: string): Promise<InstallResult['checks'][number]> => {
    const result = await check(join(home, 'mods', mod));

    return { mod, passed: result.passed, output: result.output };
  };

  return Promise.all(mods.map(checkMod));
};

const stageFile = async (staging: string, path: string, source: string): Promise<void> => {
  const destination = join(staging, path);
  const sourceStat = await stat(source);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, sourceStat.mode & permissionBits);
};

const stageMods = async (home: string, planned: Map<string, string>): Promise<string> => {
  const staging = await mkdtemp(join(home, stagingPrefix));

  try {
    for (const [path, source] of planned) {
      if (!isModFile(path)) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- files are staged one at a time to bound I/O
      await stageFile(staging, path, source);
    }

    return staging;
  } catch (error) {
    try {
      await rm(staging, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Could not stage mods into ${staging}`, {
        cause: cleanupError,
      });
    }

    throw error;
  }
};

const adoptPlanned = (owned: Set<string>, planned: Map<string, string>): void => {
  for (const path of planned.keys()) {
    owned.add(path);
  }
};

const unownedConflict = (path: string): Error =>
  new Error(`Refusing to replace ${path}, which this installer did not write`);

const pathAncestors = (path: string): string[] => {
  const ancestors: string[] = [];
  let current = '';

  for (const part of dirname(path).split(sep)) {
    if (part === '' || part === '.') {
      continue;
    }

    current = current === '' ? part : join(current, part);
    ancestors.push(current);
  }

  return ancestors;
};

const removeOwnedDirectory = async (
  home: string,
  path: string,
  owned: Set<string>,
): Promise<string[]> => {
  const destination = join(home, path);
  const relativeLeaves = await leavesUnder(destination);
  const leaves = relativeLeaves.map((leaf) => join(path, leaf));

  for (const leaf of leaves) {
    if (!owned.has(leaf)) {
      throw unownedConflict(join(home, leaf));
    }
  }

  await rm(destination, { recursive: true, force: true });

  for (const leaf of leaves) {
    owned.delete(leaf);
  }

  return leaves;
};

const resolveAncestorConflict = async (
  home: string,
  ancestor: string,
  owned: Set<string>,
): Promise<AncestorResolution> => {
  const existing = await lstatOrNull(join(home, ancestor));

  if (existing === null) {
    return 'missing';
  }

  if (existing.isDirectory()) {
    return 'directory';
  }

  if (!owned.has(ancestor)) {
    throw unownedConflict(join(home, ancestor));
  }

  await unlink(join(home, ancestor));
  owned.delete(ancestor);

  return 'removed';
};

const resolveDestinationConflict = async (
  home: string,
  path: string,
  owned: Set<string>,
): Promise<string[]> => {
  const removed: string[] = [];

  for (const ancestor of pathAncestors(path)) {
    // eslint-disable-next-line no-await-in-loop -- each ancestor is checked before the next one
    const resolution = await resolveAncestorConflict(home, ancestor, owned);

    if (resolution === 'missing') {
      break;
    }

    if (resolution === 'removed') {
      removed.push(ancestor);

      break;
    }
  }

  const existing = await lstatOrNull(join(home, path));

  if (existing?.isDirectory() === true) {
    removed.push(...(await removeOwnedDirectory(home, path, owned)));
  }

  return removed;
};

const resolveConflicts = async (
  home: string,
  files: [string, string][],
  owned: Set<string>,
): Promise<string[]> => {
  const removed: string[] = [];

  for (const [path] of files) {
    // eslint-disable-next-line no-await-in-loop -- destinations are resolved one at a time
    removed.push(...(await resolveDestinationConflict(home, path, owned)));
  }

  return removed;
};

const writeRecordFile = async (path: string, text: string): Promise<void> => {
  await writeFile(path, text, { flag: 'wx' });
};

const finishInstall = async (
  home: string,
  files: string[],
  checkout: string,
  inputs: InstallInput[],
  temporaryRecordName: string,
  writeFileTo: (path: string, text: string) => Promise<void>,
  removeStaging: (path: string) => Promise<void>,
  progress: InstallProgress,
): Promise<void> => {
  let completed = false;

  try {
    if (progress.staging !== null) {
      await removeStaging(progress.staging);
    }

    completed = progress.applied;
  } finally {
    await writeRecord(
      home,
      files,
      { checkout, allChecksPassed: completed, completed, inputs },
      temporaryRecordName,
      writeFileTo,
    );
  }
};

const removeStagingDirectory = async (path: string): Promise<void> => {
  await rm(path, { recursive: true, force: true });
};

const defaultTemporaryRecordName = (): string => `${recordName}.${randomUUID()}.tmp`;

const publishPlan = async (
  home: string,
  options: InstallOptions,
  planned: Map<string, string>,
  modFiles: [string, string][],
  configFiles: [string, string][],
  stale: string[],
  owned: Set<string>,
  chmodFile: (path: string, mode: number) => Promise<void>,
  progress: InstallProgress,
): Promise<void> => {
  const recordOwned = (writtenPath: string): void => {
    owned.add(writtenPath);
  };

  progress.staging = await stageMods(home, planned);
  progress.checks.push(...(await checkMods(progress.staging, planned, options.check)));

  if (!progress.checks.every((check) => check.passed)) {
    return;
  }

  progress.removed.push(...(await resolveConflicts(home, modFiles, owned)));

  const modsWritten = await installFiles(home, modFiles, chmodFile, recordOwned, progress.staging);

  progress.written.push(...modsWritten);
  progress.removed.push(...(await resolveConflicts(home, configFiles, owned)));

  const configWritten = await installFiles(home, configFiles, chmodFile, recordOwned);

  progress.written.push(...configWritten);
  progress.removed.push(...(await removeStale(home, stale, owned)));

  adoptPlanned(owned, planned);

  progress.applied = true;
};

export const install = async (options: InstallOptions): Promise<InstallResult> => {
  const home = resolve(options.home);
  const roots = options.roots ?? { userHome: resolve(homedir()), temporary: resolve(tmpdir()) };
  const chmodFile = options.chmodFile ?? chmod;
  const writeRecordTo = options.writeRecordFile ?? writeRecordFile;
  const temporaryRecordName = options.temporaryRecordName ?? defaultTemporaryRecordName;
  const removeStaging = options.removeStaging ?? removeStagingDirectory;

  await refuseLinkedHome(home, roots);
  await mkdir(home, { recursive: true });

  const releaseLocks = await acquireInstallLocks(home, options);

  try {
    const planned = await plannedFiles(options);
    const modFiles = [...planned].filter(([path]) => isModFile(path));
    const configFiles = [...planned].filter(([path]) => !isModFile(path));
    const checkout = await realpath(options.checkout);
    const earlierRecord = await readRecord(home);
    const earlier = earlierRecord?.files ?? [];
    const stale = earlier.filter((file) => !planned.has(file));
    const owned = new Set<string>();

    const progress: InstallProgress = {
      written: [],
      removed: [],
      checks: [],
      applied: false,
      staging: null,
    };

    for (const path of earlier) {
      // eslint-disable-next-line no-await-in-loop -- earlier paths are checked before anything changes
      if ((await lstatOrNull(join(home, path))) !== null) {
        owned.add(path);
      }
    }

    for (const path of [...planned.keys(), ...stale, recordName]) {
      // eslint-disable-next-line no-await-in-loop -- every destination is checked before anything changes
      await refuseLinkedFolders(home, path);
    }

    try {
      await publishPlan(
        home,
        options,
        planned,
        modFiles,
        configFiles,
        stale,
        owned,
        chmodFile,
        progress,
      );
    } finally {
      await finishInstall(
        home,
        [...owned],
        checkout,
        options.inputs,
        temporaryRecordName(),
        writeRecordTo,
        removeStaging,
        progress,
      );
    }

    return { written: progress.written, removed: progress.removed, checks: progress.checks };
  } finally {
    await releaseLocks();
  }
};

const herdrCheck = async (modFolder: string): Promise<CheckResult> => {
  const binary = Bun.env['HERDR_APP_BIN'] ?? 'herdr-app';
  const child = Bun.spawn([binary, 'check', modFolder], { stdout: 'pipe', stderr: 'pipe' });

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { passed: code === 0, output: `${stdout}${stderr}`.trim() };
};

const report = (result: InstallResult): boolean => {
  const lines = [
    `Wrote ${result.written.length} files, removed ${result.removed.length}.`,
    ...result.removed.map((path) => `Removed ${path}`),
    ...result.checks.map((check) => check.output),
  ];

  process.stdout.write(`${lines.join('\n')}\n`);

  return result.checks.every((check) => check.passed);
};

const buildAndInstall = async (home: string): Promise<boolean> => {
  const checkout = process.cwd();
  const inputs = await shippedInputs(checkout);

  await buildMods(sourceDirectory, outputDirectory);

  const result = await install({
    home,
    checkout,
    inputs,
    modsDirectory: outputDirectory,
    configDirectory: 'config',
    check: herdrCheck,
  });

  return report(result);
};

const reportError = (error: unknown): void => {
  process.stderr.write(`${String(error)}\n`);
};

const watchAndInstall = (home: string): void => {
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const runOnce = async (): Promise<void> => {
    if (running) {
      again = true;

      return;
    }

    running = true;
    await buildAndInstall(home).catch(reportError);
    running = false;

    if (again) {
      again = false;
      await runOnce();
    }
  };

  const schedule = (): void => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      runOnce().catch(reportError);
    }, watchDebounceMilliseconds);
  };

  for (const directory of ['src', 'config']) {
    watch(directory, { recursive: true }, schedule);
  }

  process.stdout.write('Watching src and config for changes.\n');
  schedule();
};

if (import.meta.main) {
  const home = Bun.env['HERDR_APP_HOME'] ?? join(homedir(), '.config', 'herdr-app');

  if (process.argv.includes('--watch')) {
    watchAndInstall(home);
  } else if (!(await buildAndInstall(home))) {
    process.exitCode = 1;
  }
}
