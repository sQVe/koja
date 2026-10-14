import { accessSync, constants, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';

import { readStat } from './processGroups.ts';

interface ForegroundProcess {
  pid: number;
  group: number;
  name: string;
  argv: string[];
  cmdline: string;
  cwd: string | undefined;
}

interface FolderSource {
  pid: number;
  folder: string;
}

interface PaneFolderSources {
  shell: FolderSource | undefined;
  foreground: FolderSource | undefined;
  foregroundGroup: number | undefined;
}

export interface PaneFolders {
  cwd: string | undefined;
  foregroundCwd: string | undefined;
  foregroundGroup: number | undefined;
}

export interface PaneProcesses {
  shellPid: number;
  cwd: string | undefined;
  foregroundGroup: number | undefined;
  foregroundCwd: string | undefined;
  foregroundProcesses: ForegroundProcess[];
}

const numericName = /^\d+$/;

// Splits the NUL-separated /proc/<pid>/cmdline. Each argument ends with a NUL.
export const splitCommandLine = (raw: string): string[] => {
  if (raw === '') {
    return [];
  }

  const fields = raw.split('\0');

  if (fields.at(-1) === '') {
    fields.pop();
  }

  return fields;
};

export const readProcessFolder = (pid: number): string | undefined => {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    // The process ended, or its folder is not readable.
    return undefined;
  }
};

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

const readForegroundProcess = (pid: number, group: number): ForegroundProcess | undefined => {
  const raw = readText(`/proc/${pid}/cmdline`);
  const argv = splitCommandLine(raw ?? '');

  if (argv.length === 0) {
    return undefined;
  }

  const name = readText(`/proc/${pid}/comm`)?.trim() ?? argv[0] ?? '';

  return { pid, group, name, argv, cmdline: argv.join(' '), cwd: readProcessFolder(pid) };
};

const readGroupProcesses = (group: number, session: number): ForegroundProcess[] => {
  const processes: ForegroundProcess[] = [];

  for (const name of readdirSync('/proc')) {
    if (!numericName.test(name)) {
      continue;
    }

    const stat = readStat(name);

    if (stat?.group !== group || stat.session !== session) {
      continue;
    }

    const process = readForegroundProcess(Number(name), group);

    if (process !== undefined) {
      processes.push(process);
    }
  }

  return processes.toSorted((left, right) => left.pid - right.pid);
};

const sourceOf = (pid: number): FolderSource | undefined => {
  const folder = readProcessFolder(pid);

  return folder === undefined ? undefined : { pid, folder };
};

const readMemberSource = (group: number, shellPid: number, cwd: string | undefined) => {
  for (const member of readGroupProcesses(group, shellPid)) {
    if (member.pid !== shellPid && member.cwd !== undefined && member.cwd !== cwd) {
      return { pid: member.pid, folder: member.cwd };
    }
  }

  return undefined;
};

// The foreground folder is the leader's folder. Only when that cannot be read does it scan the
// group for the first other process in a different folder than the shell, else it is missing.
// Without a foreground group it is the shell's folder. Each folder keeps the pid it came from.
const readPaneFolderSources = (shellPid: number): PaneFolderSources => {
  const shell = sourceOf(shellPid);
  const terminalGroup = readStat(String(shellPid))?.terminalGroup;

  const foregroundGroup =
    terminalGroup !== undefined && terminalGroup > 0 ? terminalGroup : undefined;

  if (foregroundGroup === undefined) {
    return { shell, foreground: shell, foregroundGroup };
  }

  const foreground =
    sourceOf(foregroundGroup) ?? readMemberSource(foregroundGroup, shellPid, shell?.folder);

  return { shell, foreground, foregroundGroup };
};

// Reads the shell's stat and the folders of the shell and the foreground group leader.
export const readPaneFolders = (shellPid: number): PaneFolders => {
  const { shell, foreground, foregroundGroup } = readPaneFolderSources(shellPid);

  return { cwd: shell?.folder, foregroundCwd: foreground?.folder, foregroundGroup };
};

// Reads the pane shell's folder and the processes in the terminal's foreground group. Linux only.
// A process that ends during the read, or a folder that cannot be read, comes back missing.
export const readPaneProcesses = (shellPid: number): PaneProcesses => {
  const { cwd, foregroundCwd, foregroundGroup } = readPaneFolders(shellPid);

  const foregroundProcesses =
    foregroundGroup === undefined ? [] : readGroupProcesses(foregroundGroup, shellPid);

  return { shellPid, cwd, foregroundGroup, foregroundCwd, foregroundProcesses };
};

const namesProcessFolder = (pid: number, folder: string): boolean => {
  try {
    const named = statSync(folder);
    const actual = statSync(`/proc/${pid}/cwd`);

    return named.isDirectory() && named.dev === actual.dev && named.ino === actual.ino;
  } catch {
    return false;
  }
};

// The link text of a deleted folder is "<path> (deleted)", which may name an unrelated folder. A
// folder is usable only when its path names the same directory the process is in.
const isEnterable = ({ pid, folder }: FolderSource): boolean => {
  try {
    accessSync(folder, constants.X_OK);
  } catch {
    return false;
  }

  return namesProcessFolder(pid, folder);
};

const deletedSuffix = ' (deleted)';

// Gives the path of a deleted folder without the suffix, so a restore treats it as gone.
export const readSavedFolder = (pid: number): string | undefined => {
  const folder = readProcessFolder(pid);

  if (folder === undefined || namesProcessFolder(pid, folder)) {
    return folder;
  }

  return folder.endsWith(deletedSuffix) ? folder.slice(0, -deletedSuffix.length) : undefined;
};

// Without an enterable folder, the caller starts the new pane in the workspace root.
export const readFollowFolder = (shellPid: number): string | undefined => {
  const { shell, foreground } = readPaneFolderSources(shellPid);

  for (const candidate of [foreground, shell]) {
    if (candidate !== undefined && isEnterable(candidate)) {
      return candidate.folder;
    }
  }

  return undefined;
};
