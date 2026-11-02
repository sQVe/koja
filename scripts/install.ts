import type { Stats } from 'node:fs';
import { watch } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';

import { buildMods, isMissing, outputDirectory, sourceDirectory } from './build.ts';

export interface CheckResult {
  passed: boolean;
  output: string;
}

export interface InstallOptions {
  home: string;
  modsDirectory: string;
  configDirectory: string;
  check: (modFolder: string) => Promise<CheckResult>;
}

export interface InstallResult {
  written: string[];
  removed: string[];
  checks: (CheckResult & { mod: string })[];
}

const recordName = '.koja-install.json';

const recordVersion = 1;

const permissionBits = 0o777;

const watchDebounceMilliseconds = 200;

const lstatOrNull = async (path: string): Promise<Stats | null> =>
  lstat(path).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  });

const filesUnder = async (directory: string): Promise<string[]> => {
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

const readRecord = async (home: string): Promise<string[]> => {
  const path = join(home, recordName);
  const existing = await lstatOrNull(path);

  if (existing === null || existing.isSymbolicLink()) {
    return [];
  }

  try {
    const record: unknown = JSON.parse(await readFile(path, 'utf8'));

    const files =
      typeof record === 'object' && record !== null && 'files' in record ? record.files : [];

    return Array.isArray(files)
      ? files.filter((file): file is string => typeof file === 'string').filter(isInsideHome)
      : [];
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
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

const isSameFile = async (source: string, destination: string): Promise<boolean> => {
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

const installFile = async (home: string, path: string, source: string): Promise<boolean> => {
  const destination = join(home, path);

  await removeSymlinkLeaf(destination);

  const existing = await lstatOrNull(destination);

  if (existing !== null && (await isSameFile(source, destination))) {
    return false;
  }

  const sourceStat = await stat(source);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, sourceStat.mode & permissionBits);

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

export const install = async (options: InstallOptions): Promise<InstallResult> => {
  const { home } = options;
  const planned = await plannedFiles(options);
  const earlier = await readRecord(home);
  const stale = earlier.filter((file) => !planned.has(file));
  const written: string[] = [];
  const removed: string[] = [];

  for (const path of [...planned.keys(), ...stale, recordName]) {
    // eslint-disable-next-line no-await-in-loop -- every destination is checked before anything changes
    await refuseLinkedFolders(home, path);
  }

  for (const [path, source] of planned) {
    // eslint-disable-next-line no-await-in-loop -- files are written one at a time, in order
    if (await installFile(home, path, source)) {
      written.push(path);
    }
  }

  for (const path of stale) {
    // eslint-disable-next-line no-await-in-loop -- removals go one at a time, so empty folders go too
    if (await removeFile(home, path)) {
      removed.push(path);
    }
  }

  const record = { version: recordVersion, files: [...planned.keys()].toSorted() };
  const recordPath = join(home, recordName);

  await removeSymlinkLeaf(recordPath);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  const checks = await Promise.all(
    installedMods(planned.keys()).map(async (mod) => {
      const result = await options.check(join(home, 'mods', mod));

      return { mod, passed: result.passed, output: result.output };
    }),
  );

  return { written, removed, checks };
};

const herdrCheck = async (modFolder: string): Promise<CheckResult> => {
  const child = Bun.spawn(['herdr-app', 'check', modFolder], { stdout: 'pipe', stderr: 'pipe' });

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
  await buildMods(sourceDirectory, outputDirectory);

  const result = await install({
    home,
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
