import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeKitCss } from '../scripts/kitCss.ts';

const repositoryRoot = join(import.meta.dir, '..');

const sizeModule = `export const textSize = { xsmall: 9, small: 11, default: 13, large: 15 } as const;
export const iconSize = { xsmall: 10, small: 12, default: 14, large: 16 } as const;
export const spacing = { none: 0, hairline: 1, xxsmall: 2, xsmall: 4 } as const;
export const radius = { default: 4, pill: 6, dialog: 8 } as const;
export const rowHeight = { small: 24, medium: 26, large: 28 } as const;
export const controlSize = { badge: 18, paneLabelMaxWidth: 260 } as const;
export const markSize = { slot: 12, dot: 6, quietDot: 4 } as const;
export const diffSize = { headerHeight: 34, rowHeight: 18 } as const;
export const overlaySize = { menuWidth: 200, pickerWidthShare: 0.6 } as const;
`;

let root: string;

const writeFakeRoot = async (sizeSource: string): Promise<void> => {
  await mkdir(join(root, 'src', 'kit'), { recursive: true });
  await mkdir(join(root, 'config', 'themes'), { recursive: true });
  await writeFile(join(root, 'src', 'kit', 'size.ts'), sizeSource);

  await copyFile(
    join(repositoryRoot, 'config', 'themes', 'catppuccin-latte-muted.json'),
    join(root, 'config', 'themes', 'catppuccin-latte-muted.json'),
  );

  await copyFile(
    join(repositoryRoot, 'config', 'settings.json'),
    join(root, 'config', 'settings.json'),
  );
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-kit-css-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('writeKitCss', () => {
  test('writes a size from src/kit/size.ts as a px custom property', async () => {
    await writeFakeRoot(sizeModule.replace('default: 13', 'default: 17'));

    const output = join(root, 'kit.css');

    await writeKitCss(root, output);

    expect(await readFile(output, 'utf8')).toContain('--koja-text-size-default: 17px;');
  });

  test('writes status mark, diff, and overlay sizes', async () => {
    await writeFakeRoot(sizeModule);

    const output = join(root, 'kit.css');

    await writeKitCss(root, output);

    const css = await readFile(output, 'utf8');

    expect(css).toContain('--koja-mark-size-dot: 6px;');
    expect(css).toContain('--koja-diff-size-row-height: 18px;');
    expect(css).toContain('--koja-overlay-size-menu-width: 200px;');
  });

  test('writes a fraction of the window without a unit', async () => {
    await writeFakeRoot(sizeModule);

    const output = join(root, 'kit.css');

    await writeKitCss(root, output);

    expect(await readFile(output, 'utf8')).toContain(
      '--koja-overlay-size-picker-width-share: 0.6;',
    );
  });

  test('keeps eval/kit.css in the checkout up to date with the generator', async () => {
    const output = join(root, 'kit.css');

    await writeKitCss(repositoryRoot, output);

    expect(await readFile(output, 'utf8')).toBe(
      await readFile(join(repositoryRoot, 'eval', 'kit.css'), 'utf8'),
    );
  });
});
