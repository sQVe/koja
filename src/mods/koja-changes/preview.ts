import { exec, readTextFile } from 'herdr';

import type { ChangesSnapshot } from './git.ts';
import { readFlags } from './git.ts';
import { countLines } from './status.ts';
import type { ChangeFile } from './status.ts';

export interface FilePreview {
  lines: string[];
  addedLines: number | null;
}

const previewCharacterLimit = 400000;

const lineLimit = 1500;

const lineCharacterLimit = 4000;

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
