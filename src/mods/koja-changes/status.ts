export type FileStatus = 'A' | 'M' | 'D' | 'U';

export interface StatusFile {
  path: string;
  status: FileStatus;
  fresh: boolean;
}

export interface ChangeFile extends StatusFile {
  add: number;
  del: number;
  binary: boolean;
}

interface Numstat {
  add: number;
  del: number;
  binary: boolean;
}

const statusPrefixLength = 3;

const statusOf = (xy: string): FileStatus => {
  if (xy.includes('U') || xy === 'AA' || xy === 'DD') {
    return 'U';
  }

  if (xy.includes('D')) {
    return 'D';
  }

  if (xy === '??' || xy.includes('A')) {
    return 'A';
  }

  return 'M';
};

export const parseStatus = (stdout: string): StatusFile[] =>
  stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const xy = entry.slice(0, 2);

      return { path: entry.slice(statusPrefixLength), status: statusOf(xy), fresh: xy === '??' };
    });

const readNumstat = (stdout: string): Map<string, Numstat> => {
  const stats = new Map<string, Numstat>();

  for (const entry of stdout.split('\0')) {
    const [add, del, ...parts] = entry.split('\t');

    if (parts.length === 0) {
      continue;
    }

    stats.set(parts.join('\t'), {
      add: Number(add) || 0,
      del: Number(del) || 0,
      binary: add === '-',
    });
  }

  return stats;
};

const mergeNumstatOutputs = (outputs: string[]): Map<string, Numstat> => {
  const merged = new Map<string, Numstat>();

  for (const output of outputs) {
    for (const [path, stat] of readNumstat(output)) {
      const previous = merged.get(path) ?? { add: 0, del: 0, binary: false };

      merged.set(path, {
        add: previous.add + stat.add,
        del: previous.del + stat.del,
        binary: stat.binary,
      });
    }
  }

  return merged;
};

const noStat: Numstat = { add: 0, del: 0, binary: false };

export const mergeNumstat = (files: StatusFile[], outputs: string[]): ChangeFile[] => {
  const stats = mergeNumstatOutputs(outputs);

  return files.map((file) => ({ ...file, ...(stats.get(file.path) ?? noStat) }));
};

export const countLines = (text: string): number =>
  text === '' ? 0 : text.split('\n').length - Number(text.endsWith('\n'));
