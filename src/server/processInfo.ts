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

const readMemberFolder = (group: number, shellPid: number, cwd: string | undefined) => {
  for (const member of readGroupProcesses(group, shellPid)) {
    if (member.pid !== shellPid && member.cwd !== undefined && member.cwd !== cwd) {
      return member.cwd;
    }
  }

  return undefined;
};

// Reads the shell's stat and the folders of the shell and the foreground group leader. The
// foreground folder is the leader's folder. Only when that cannot be read does it scan the group
// for the first other process in a different folder than the shell, else it is missing. Without a
// foreground group it is the shell's folder.
export const readPaneFolders = (shellPid: number): PaneFolders => {
  const cwd = readProcessFolder(shellPid);
  const terminalGroup = readStat(String(shellPid))?.terminalGroup;

  const foregroundGroup =
    terminalGroup !== undefined && terminalGroup > 0 ? terminalGroup : undefined;

  if (foregroundGroup === undefined) {
    return { cwd, foregroundCwd: cwd, foregroundGroup };
  }

  const foregroundCwd =
    readProcessFolder(foregroundGroup) ?? readMemberFolder(foregroundGroup, shellPid, cwd);

  return { cwd, foregroundCwd, foregroundGroup };
};

// Reads the pane shell's folder and the processes in the terminal's foreground group. Linux only.
// A process that ends during the read, or a folder that cannot be read, comes back missing.
export const readPaneProcesses = (shellPid: number): PaneProcesses => {
  const { cwd, foregroundCwd, foregroundGroup } = readPaneFolders(shellPid);

  const foregroundProcesses =
    foregroundGroup === undefined ? [] : readGroupProcesses(foregroundGroup, shellPid);

  return { shellPid, cwd, foregroundGroup, foregroundCwd, foregroundProcesses };
};

const isEnterable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);

    return statSync(path).isDirectory();
  } catch {
    // A deleted folder reads as "<path> (deleted)", which does not exist.
    return false;
  }
};

// Without an enterable folder, the caller starts the new pane in the workspace root.
export const readFollowFolder = (shellPid: number): string | undefined => {
  const { cwd, foregroundCwd } = readPaneFolders(shellPid);

  for (const candidate of [foregroundCwd, cwd]) {
    if (candidate !== undefined && isEnterable(candidate)) {
      return candidate;
    }
  }

  return undefined;
};
