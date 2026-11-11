import type { Stats } from 'node:fs';
import { watch } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path';

import { buildMods, isMissing, outputDirectory, sourceDirectory } from './build.ts';

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
  modifiedAt: number;
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
}

export interface InstallResult {
  written: string[];
  removed: string[];
  checks: (CheckResult & { mod: string })[];
}

export interface InstallOrigin {
  checkout: string;
  allChecksPassed: boolean;
  inputs: InstallInput[];
}

export interface InstallRecord {
  files: string[];
  origin: InstallOrigin | null;
}

type RecordFields = Record<string, unknown>;

export const recordName = '.koja-install.json';

const recordVersion = 1;

const permissionBits = 0o777;

const watchDebounceMilliseconds = 200;

export const lstatOrNull = async (path: string): Promise<Stats | null> =>
  lstat(path).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  });

export const filesUnder = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
  }
};

const shippedFolders = ['src', 'config'];

const shippedFiles = ['scripts/build.ts', 'scripts/install.ts', 'package.json', 'bun.lock'];

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

export const shippedInputs = async (checkout: string): Promise<InstallInput[]> => {
  const paths = await shippedPaths(checkout);
  const entries = await Promise.all(paths.map(async (path) => lstatOrNull(join(checkout, path))));
  const inputs: InstallInput[] = [];

  for (const [index, path] of paths.entries()) {
    const entry = entries[index];

    if (entry !== null && entry !== undefined) {
      inputs.push({ path, modifiedAt: entry.mtimeMs });
    }
  }

  return inputs;
};

const plannedFiles = async (options: InstallOptions): Promise<Map<string, string>> => {
  const planned = new Map<string, string>();

  for (const file of await filesUnder(options.configDirectory)) {
    planned.set(file, join(options.configDirectory, file));
  }

  for (const file of await filesUnder(options.modsDirectory)) {
    planned.set(join('mods', file), join(options.modsDirectory, file));
  }

  return planned;
};

const isInsideHome = (path: string): boolean => {
  const normalized = normalize(path);
  const escapes = normalized === '..' || normalized.startsWith(`..${sep}`);

  return !isAbsolute(normalized) && !escapes;
};

const isRecordFields = (value: unknown): value is RecordFields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordedFiles = (record: RecordFields): string[] => {
  const { files } = record;

  return Array.isArray(files)
    ? files.filter((file): file is string => typeof file === 'string').filter(isInsideHome)
    : [];
};

const isInstallInput = (value: unknown): value is InstallInput => {
  if (!isRecordFields(value)) {
    return false;
  }

  return typeof value['path'] === 'string' && typeof value['modifiedAt'] === 'number';
};

const isInstallInputs = (value: unknown): value is InstallInput[] =>
  Array.isArray(value) && value.every(isInstallInput);

const recordedOrigin = (record: RecordFields): InstallOrigin | null => {
  const { checkout, allChecksPassed, inputs } = record;

  if (typeof checkout !== 'string' || typeof allChecksPassed !== 'boolean') {
    return null;
  }

  if (!isInstallInputs(inputs)) {
    return null;
  }

  return { checkout, allChecksPassed, inputs };
};

export const readRecord = async (home: string): Promise<InstallRecord | null> => {
  const path = join(home, recordName);
  const existing = await lstatOrNull(path);

  if (existing === null || existing.isSymbolicLink()) {
    return null;
  }

  try {
    const record: unknown = JSON.parse(await readFile(path, 'utf8'));

    if (!isRecordFields(record)) {
      return { files: [], origin: null };
    }

    return { files: recordedFiles(record), origin: recordedOrigin(record) };
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

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  onWritten(path);
  await chmodFile(destination, sourceStat.mode & permissionBits);

  return true;
};

const removeEmptyFolders = async (home: string, path: string): Promise<void> => {
  let folder = dirname(join(home, path));

  while (folder !== home && folder.startsWith(home)) {
    // eslint-disable-next-line no-await-in-loop -- a parent can only be empty once its child is gone
    const entries = await readdir(folder).catch(() => null);

    if (entries === null || entries.length > 0) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop -- as above
    await rmdir(folder);
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

const writeRecord = async (home: string, files: string[], origin: InstallOrigin): Promise<void> => {
  const record = {
    version: recordVersion,
    checkout: origin.checkout,
    allChecksPassed: origin.allChecksPassed,
    inputs: origin.inputs.toSorted(byPath),
    files: files.toSorted(),
  };

  const recordPath = join(home, recordName);

  await removeSymlinkLeaf(recordPath);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
};

const isModFile = (path: string): boolean => path.split(sep)[0] === 'mods';

const installFiles = async (
  home: string,
  files: [string, string][],
  chmodFile: (path: string, mode: number) => Promise<void>,
  onWritten: (path: string) => void,
): Promise<string[]> => {
  const written: string[] = [];

  for (const [path, source] of files) {
    // eslint-disable-next-line no-await-in-loop -- files are written one at a time, in order
    if (await installFile(home, path, source, chmodFile, onWritten)) {
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
): Promise<InstallResult['checks']> =>
  Promise.all(
    installedMods(planned.keys()).map(async (mod) => {
      const result = await check(join(home, 'mods', mod));

      return { mod, passed: result.passed, output: result.output };
    }),
  );

export const install = async (options: InstallOptions): Promise<InstallResult> => {
  const home = resolve(options.home);
  const roots = options.roots ?? { userHome: resolve(homedir()), temporary: resolve(tmpdir()) };
  const chmodFile = options.chmodFile ?? chmod;

  await refuseLinkedHome(home, roots);

  const planned = await plannedFiles(options);
  const modFiles = [...planned].filter(([path]) => isModFile(path));
  const configFiles = [...planned].filter(([path]) => !isModFile(path));
  const checkout = await realpath(options.checkout);
  const earlierRecord = await readRecord(home);
  const earlier = earlierRecord?.files ?? [];
  const stale = earlier.filter((file) => !planned.has(file));
  const written: string[] = [];
  const removed: string[] = [];
  const checks: InstallResult['checks'] = [];
  const owned = new Set<string>();
  let allChecksPassed = false;

  const recordOwned = (writtenPath: string): void => {
    owned.add(writtenPath);
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
    const modsWritten = await installFiles(home, modFiles, chmodFile, recordOwned);

    written.push(...modsWritten);
    checks.push(...(await checkMods(home, planned, options.check)));

    allChecksPassed = checks.every((check) => check.passed);

    if (allChecksPassed) {
      const configWritten = await installFiles(home, configFiles, chmodFile, recordOwned);

      written.push(...configWritten);
      removed.push(...(await removeStale(home, stale, owned)));
    }
  } finally {
    await writeRecord(home, [...owned], { checkout, allChecksPassed, inputs: options.inputs });
  }

  return { written, removed, checks };
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
