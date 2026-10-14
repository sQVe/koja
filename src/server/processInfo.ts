import { readdirSync, readFileSync, readlinkSync } from 'node:fs';

import { readStat } from './processGroups.ts';

interface ForegroundProcess {
  pid: number;
  group: number;
  name: string;
  argv: string[];
  cmdline: string;
  cwd: string | undefined;
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

// Reads the pane shell's folder and the processes in the terminal's foreground group. Linux only.
// A process that ends during the read, or a folder that cannot be read, comes back missing.
export const readPaneProcesses = (shellPid: number): PaneProcesses => {
  const cwd = readProcessFolder(shellPid);
  const shellStat = readStat(String(shellPid));
  const terminalGroup = shellStat?.terminalGroup;

  const foregroundGroup =
    terminalGroup !== undefined && terminalGroup > 0 ? terminalGroup : undefined;

  if (foregroundGroup === undefined) {
    return { shellPid, cwd, foregroundGroup, foregroundCwd: cwd, foregroundProcesses: [] };
  }

  const foregroundProcesses = readGroupProcesses(foregroundGroup, shellPid);
  const leaderFolder = readProcessFolder(foregroundGroup);

  return {
    shellPid,
    cwd,
    foregroundGroup,
    foregroundCwd: leaderFolder ?? cwd,
    foregroundProcesses,
  };
};
