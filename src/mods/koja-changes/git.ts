import type { ExecResult } from 'herdr';
import { exec, readTextFile } from 'herdr';

import type { ChangeFile } from './status.ts';
import { countLines, mergeNumstat, parseStatus } from './status.ts';

export interface ChangesSnapshot {
  root: string;
  on: string | null;
  hasHead: boolean;
  files: ChangeFile[];
  limited: boolean;
}

export interface FilePreview {
  lines: string[];
  addedLines: number | null;
}

export interface ChangesResult {
  snapshot: ChangesSnapshot | null;
  error: string | null;
}

const readFlags = [
  '--no-optional-locks',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.autoRefreshIndex=false',
];

const fileLimit = 1000;

const previewCharacterLimit = 400000;

const lineLimit = 1500;

const lineCharacterLimit = 4000;

export const readChanges = async (
  cwd: string,
  on: string | null,
  isCurrent: () => boolean,
): Promise<ChangesResult | null> => {
  const top = await exec('git', ['rev-parse', '--show-toplevel'], { cwd, on });

  if (!isCurrent()) {
    return null;
  }

  if (top.code !== 0) {
    return { snapshot: null, error: 'Not a git repository' };
  }

  const root = top.stdout.trim();

  const git = (args: string[]): Promise<ExecResult> =>
    exec('git', [...readFlags, ...args], { cwd: root, on });

  const status = await git([
    'status',
    '--porcelain=v1',
    '-z',
    '--no-renames',
    '--untracked-files=all',
  ]);

  if (status.code !== 0) {
    throw new Error(status.stderr);
  }

  const head = await git(['rev-parse', '--verify', 'HEAD']);
  const outputs: string[] = [];

  const collect = async (args: string[]): Promise<void> => {
    const result = await git(args);

    if (result.code !== 0) {
      throw new Error(result.stderr);
    }

    outputs.push(result.stdout);
  };

  if (head.code === 0) {
    await collect(['diff', 'HEAD', '--numstat', '-z', '--no-renames']);
  } else {
    await collect(['diff', '--cached', '--numstat', '-z', '--no-renames']);
    await collect(['diff', '--numstat', '-z', '--no-renames']);
  }

  const entries = parseStatus(status.stdout);

  return {
    snapshot: {
      root,
      on,
      hasHead: head.code === 0,
      files: mergeNumstat(entries.slice(0, fileLimit), outputs),
      limited: entries.length > fileLimit,
    },
    error: null,
  };
};

export const loadFilePreview = async (
  file: Readonly<ChangeFile>,
  snapshot: ChangesSnapshot,
): Promise<FilePreview> => {
  const { root, on, hasHead } = snapshot;
  let lines: string[];
  let addedLines: number | null = null;
  const addedWithoutHead = !hasHead && file.status === 'A';

  if (file.fresh || addedWithoutHead) {
    const text = await readTextFile(`${root}/${file.path}`, { on }).catch(() => null);

    if (text === null) {
      lines = ['Cannot preview this file (binary, too large, or unreadable)'];
    } else if (text.includes('\0')) {
      lines = ['Binary file · no text diff'];
    } else {
      addedLines = countLines(text);

      lines = [
        `@@ -0,0 +1,${addedLines} @@`,
        ...text
          .slice(0, previewCharacterLimit)
          .replace(/\n$/, '')
          .split('\n')
          .slice(0, lineLimit)
          .map((line) => `+${line}`),
      ];
    }
  } else {
    const result = await exec(
      'git',
      [
        ...readFlags,
        'diff',
        ...(hasHead ? ['HEAD'] : []),
        '--no-ext-diff',
        '--no-textconv',
        '--no-color',
        '--',
        file.path,
      ],
      { cwd: root, on },
    );

    if (result.code !== 0) {
      throw new Error(result.stderr);
    }

    const all = result.stdout.replace(/\n$/, '').split('\n');
    const first = all.findIndex((line) => line.startsWith('@@'));

    lines =
      first === -1
        ? [file.binary ? 'Binary file changed' : 'No text diff available']
        : all.slice(first);
  }

  const shownLines = lines
    .slice(0, lineLimit)
    .map((line) =>
      line.length > lineCharacterLimit
        ? `${line.slice(0, lineCharacterLimit)}… (line truncated)`
        : line,
    );

  return { lines: shownLines, addedLines };
};

export const commitAll = async (
  root: string,
  on: string | null,
  message: string,
): Promise<void> => {
  const add = await exec('git', ['add', '-A'], { cwd: root, on });

  if (add.code !== 0) {
    throw new Error((add.stderr || add.stdout).trim());
  }

  const commit = await exec('git', ['commit', '-m', message], { cwd: root, on });

  if (commit.code !== 0) {
    throw new Error((commit.stderr || commit.stdout).trim());
  }
};
