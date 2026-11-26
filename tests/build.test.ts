import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';

import { buildMods } from '../scripts/build.ts';
import { acquireCheckoutLock } from '../scripts/fileLock.ts';

interface StructuredDiagnostic {
  readonly message: string;
  readonly position: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  } | null;
}

let root: string;
let source: string;
let output: string;

const writeSource = async (path: string, content: string): Promise<void> => {
  const file = join(source, path);

  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
};

const readTree = async (directory: string): Promise<Record<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  const snapshot = await Promise.all(
    entries.map(async (entry) => {
      const path = relative(directory, join(entry.parentPath, entry.name));

      if (entry.isDirectory()) {
        return [path, 'directory'] as const;
      }

      if (entry.isSymbolicLink()) {
        return [path, `symlink:${await readlink(join(directory, path))}`] as const;
      }

      const content = await readFile(join(directory, path));

      return [path, `file:${content.toString('base64')}`] as const;
    }),
  );

  return Object.fromEntries(snapshot);
};

const exists = async (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

const isStructuredDiagnostic = (value: unknown): value is StructuredDiagnostic =>
  value instanceof Error && 'position' in value;

const firstDiagnosticOf = (failure: unknown): StructuredDiagnostic | null => {
  if (failure instanceof AggregateError) {
    for (const nested of failure.errors) {
      const diagnostic = firstDiagnosticOf(nested);

      if (diagnostic !== null) {
        return diagnostic;
      }
    }
  }

  return isStructuredDiagnostic(failure) ? failure : null;
};

const positionedDiagnosticOf = (
  failure: unknown,
): StructuredDiagnostic & {
  readonly position: NonNullable<StructuredDiagnostic['position']>;
} => {
  const diagnostic = firstDiagnosticOf(failure);

  if (diagnostic === null) {
    throw new Error('The failure has no positioned diagnostic');
  }

  const { position } = diagnostic;

  if (position === null) {
    throw new Error('The failure has no positioned diagnostic');
  }

  return { message: diagnostic.message, position };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-build-'));
  source = join(root, 'src', 'mods');
  output = join(root, 'dist', 'mods');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildMods', () => {
  test('refuses an output that is the source directory and keeps the tree unchanged', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const before = await readTree(root);
    const failure = await buildMods(source, source).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('overlap');
    expect(await readTree(root)).toEqual(before);
  });

  test('refuses an output that contains the source directory and keeps the tree unchanged', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const before = await readTree(root);
    const failure = await buildMods(source, join(root, 'src')).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('overlap');
    expect(await readTree(root)).toEqual(before);
  });

  test('refuses an output inside the source directory and keeps the tree unchanged', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const before = await readTree(root);
    const failure = await buildMods(source, join(source, 'dist')).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('overlap');
    expect(await readTree(root)).toEqual(before);
  });

  test('refuses an output that aliases the source through a symlink and keeps the tree unchanged', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const alias = join(root, 'source-alias');

    await symlink(source, alias, 'dir');

    const before = await readTree(root);
    const failure = await buildMods(source, alias).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('overlap');
    expect(await readTree(root)).toEqual(before);
  });

  test('refuses an output whose final symlink hides overlap with the source', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const outside = join(root, 'outside');
    const finalLink = join(source, 'mods');

    await mkdir(outside);
    await symlink(outside, finalLink, 'dir');
    await symlink(source, join(root, 'dist'), 'dir');

    const before = await readTree(root);

    const failure = await buildMods(source, join(root, 'dist', 'mods')).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('overlap');
    expect(await readTree(root)).toEqual(before);
    expect((await lstat(finalLink)).isSymbolicLink()).toBe(true);
  });

  test('waits for the checkout lock before staging', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    let signalWaiting!: () => void;

    const waiting = new Promise<void>((resolve) => {
      signalWaiting = resolve;
    });

    const release = await acquireCheckoutLock(root);
    const build = buildMods(source, output, { onCheckoutLockWait: signalWaiting });

    try {
      await Promise.race([
        waiting,
        build.then(() => {
          throw new Error('The build did not wait for the checkout lock');
        }),
      ]);

      expect(await exists(dirname(output))).toBe(false);
    } finally {
      await release();
    }

    await build;

    expect(await exists(join(output, 'menu', 'main.js'))).toBe(true);
  });

  test('bundles local modules into main.js and keeps Herdr modules as imports', async () => {
    await writeSource('../kit/size.ts', 'export const statusDotSize = 6;\n');

    await writeSource(
      'menu/main.ts',
      [
        "import { div } from 'gpui-kit';",
        "import { statusDotSize } from '../../kit/size.ts';",
        'export const dot = () => div().size(statusDotSize);',
        '',
      ].join('\n'),
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'menu', 'main.js'), 'utf8');

    expect(bundle).toMatch(/from\s*["']gpui-kit["']/);
    expect(bundle).toContain('statusDotSize = 6');
    expect(bundle).not.toMatch(/from\s*["'][^"']*kit\/size/);
  });

  test('bundles the shared data modules into an importing mod', async () => {
    await writeSource(
      '../data/snapshot.ts',
      "export const snapshotKey = 'koja.data.v1.snapshot';\n",
    );

    await writeSource(
      'spaces/main.ts',
      [
        "import { snapshotKey } from '../../data/snapshot.ts';",
        'export const key = () => snapshotKey;',
        '',
      ].join('\n'),
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'spaces', 'main.js'), 'utf8');

    expect(bundle).toContain('koja.data.v1.snapshot');
    expect(bundle).not.toMatch(/from\s*["'][^"']*data\/snapshot/);
  });

  test('copies files other than TypeScript and keeps their mode', async () => {
    await writeSource('picker/main.ts', 'export const picker = 1;\n');
    await writeSource('picker/helper.ts', 'export const helper = 1;\n');
    await writeSource('picker/mod.json', '{ "place": "none" }\n');
    await writeSource('picker/assets/folder.svg', '<svg/>\n');
    await writeSource('picker/preview.sh', '#!/bin/sh\n');
    await chmod(join(source, 'picker', 'preview.sh'), 0o755);

    await buildMods(source, output);

    const files = await readdir(join(output, 'picker'), { recursive: true });
    const preview = await stat(join(output, 'picker', 'preview.sh'));

    expect(files.toSorted()).toEqual([
      'assets',
      'assets/folder.svg',
      'main.js',
      'mod.json',
      'preview.sh',
    ]);

    expect(preview.mode & 0o777).toBe(0o755);
  });

  test('copies a directory whose name ends in .ts with its assets', async () => {
    await writeSource('picker/main.ts', 'export const picker = 1;\n');
    await writeSource('picker/assets.ts/icon.svg', '<svg/>\n');
    await writeSource('picker/assets.ts/nested/data.json', '{}\n');

    await buildMods(source, output);

    expect(await readFile(join(output, 'picker', 'assets.ts', 'icon.svg'), 'utf8')).toBe(
      '<svg/>\n',
    );

    expect(await readFile(join(output, 'picker', 'assets.ts', 'nested', 'data.json'), 'utf8')).toBe(
      '{}\n',
    );
  });

  test('does not copy TypeScript files with other extensions', async () => {
    await writeSource('picker/main.ts', 'export const picker = 1;\n');
    await writeSource('picker/component.tsx', 'export const component = 1;\n');
    await writeSource('picker/module.mts', 'export const module = 1;\n');
    await writeSource('picker/common.cts', 'export const common = 1;\n');

    await buildMods(source, output);

    const files = await readdir(join(output, 'picker'), { recursive: true });

    expect(files).not.toContain('component.tsx');
    expect(files).not.toContain('module.mts');
    expect(files).not.toContain('common.cts');
  });

  test('refuses a directory symlink whose name ends in .ts', async () => {
    await writeSource('picker/main.ts', 'export const picker = 1;\n');

    const linked = join(root, 'linked-assets');

    await mkdir(linked);
    await writeFile(join(linked, 'asset.svg'), '<svg/>\n');
    await writeFile(join(linked, 'component.tsx'), 'export const component = 1;\n');
    await writeFile(join(linked, 'module.mts'), 'export const module = 1;\n');
    await writeFile(join(linked, 'common.cts'), 'export const common = 1;\n');
    await symlink(linked, join(source, 'picker', 'assets.ts'), 'dir');

    const failure = await buildMods(source, output).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('assets.ts');
    expect(messageOf(failure)).toContain('symlink');
    expect(await exists(join(output, 'picker'))).toBe(false);
  });

  test('copies the kit icons into every mod', async () => {
    await writeSource('../kit/icons/plus.svg', '<svg id="plus"/>\n');
    await writeSource('../kit/icons/x.svg', '<svg id="x"/>\n');
    await writeSource('../kit/size.ts', 'export const iconSize = 14;\n');
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await writeSource('tabs/main.ts', 'export const tabs = 1;\n');

    await buildMods(source, output);

    for (const name of ['menu', 'tabs']) {
      expect((await readdir(join(output, name, 'icons'))).toSorted()).toEqual([
        'plus.svg',
        'x.svg',
      ]);

      expect(await readFile(join(output, name, 'icons', 'x.svg'), 'utf8')).toBe('<svg id="x"/>\n');
    }
  });

  test('gives each bundle the name of its mod folder', async () => {
    await writeSource(
      '../kit/modName.ts',
      'declare const kojaModName: string;\nexport const modName = kojaModName;\n',
    );

    await writeSource(
      'koja-tabs/main.ts',
      "import { modName } from '../../kit/modName.ts';\nexport const path = 'mods/' + modName;\n",
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'koja-tabs', 'main.js'), 'utf8');

    expect(bundle).toContain('"koja-tabs"');
    expect(bundle).not.toContain('kojaModName');
  });

  test('removes mods left from an earlier build and leaves no backup behind', async () => {
    await writeSource('tabs/main.ts', 'export const tabs = 1;\n');
    await mkdir(join(output, 'removed'), { recursive: true });
    await writeFile(join(output, 'removed', 'main.js'), '');

    const names = await buildMods(source, output);

    expect(names).toEqual(['tabs']);
    expect(await readdir(output)).toEqual(['tabs']);
    expect(await readdir(dirname(output))).toEqual(['mods']);
  });

  test('keeps the published mods and removes staging when a build fails', async () => {
    await writeSource('broken/main.ts', 'export const broken = ;\n');
    await mkdir(join(output, 'old'), { recursive: true });
    await writeFile(join(output, 'old', 'main.js'), 'old bundle\n');

    const before = await readTree(output);
    const failure = await buildMods(source, output).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(await readTree(output)).toEqual(before);
    expect(await readdir(dirname(output))).toEqual(['mods']);
  });

  test('removes a staging tree with a copied read-only directory when a build fails', async () => {
    const assets = join(source, 'broken', 'assets');

    await writeSource('broken/main.ts', 'export const broken = ;\n');
    await writeSource('broken/assets/data.json', '{}\n');
    await chmod(assets, 0o555);

    try {
      const failure = await buildMods(source, output).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AggregateError);
      expect(await readdir(dirname(output))).toEqual([]);
    } finally {
      await chmod(assets, 0o755);
    }
  });

  test('leaves no partial published output when one of two mods fails', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await writeSource('broken/main.ts', 'export const broken = ;\n');
    await mkdir(join(output, 'old'), { recursive: true });
    await writeFile(join(output, 'old', 'main.js'), 'old bundle\n');

    const before = await readTree(output);
    const failure = await buildMods(source, output).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(await readTree(output)).toEqual(before);
    expect(await readdir(output)).toEqual(['old']);
    expect(await readdir(dirname(output))).toEqual(['mods']);
  });

  test('reports every failing mod with a positioned diagnostic after all builds settle', async () => {
    await writeSource('alpha/main.ts', 'export const alpha = ;\n');
    await writeSource('beta/main.ts', 'export const beta = ;\n');

    const failure = await buildMods(source, output).catch((error: unknown) => error);
    const message = messageOf(failure);
    const diagnostic = positionedDiagnosticOf(failure);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(message).toContain('alpha');
    expect(message).toContain('beta');
    expect(message).toContain(diagnostic.message);
    expect(message).toContain(diagnostic.position.file);
    expect(message).toContain(`${diagnostic.position.line}:${diagnostic.position.column}`);
  });

  test('names the mod and the first structured diagnostic when a mod fails to build', async () => {
    await writeSource('broken/main.ts', 'export const broken = ;\n');

    const failure: unknown = await buildMods(source, output).catch((error: unknown) => error);
    const message = messageOf(failure);
    const diagnostic = positionedDiagnosticOf(failure);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(message).toContain('Could not build mod broken');
    expect(message).toContain(diagnostic.message);
    expect(message).toContain(diagnostic.position.file);
    expect(message).toContain(`${diagnostic.position.line}:${diagnostic.position.column}`);
  });

  test('keeps the positioned diagnostic when staging cleanup fails', async () => {
    await writeSource('broken/main.ts', 'export const broken = ;\n');

    const failure = await buildMods(source, output, {
      removeStaging: async () => {
        throw new Error('injected staging cleanup failure');
      },
    }).catch((error: unknown) => error);

    const message = messageOf(failure);
    const diagnostic = positionedDiagnosticOf(failure);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(message).toContain('could not remove');
    expect(message).toContain('injected staging cleanup failure');
    expect(message).toContain(diagnostic.message);
    expect(message).toContain(diagnostic.position.file);
    expect(message).toContain(`${diagnostic.position.line}:${diagnostic.position.column}`);
  });

  test('reports a backup cleanup failure after publishing without failing the build', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await mkdir(join(output, 'old'), { recursive: true });
    await writeFile(join(output, 'old', 'main.js'), 'old bundle\n');

    const warnings: string[] = [];

    const names = await buildMods(source, output, {
      removePrevious: async () => {
        throw new Error('injected backup cleanup failure');
      },
      warn: (message) => {
        warnings.push(message);
      },
    });

    expect(names).toEqual(['menu']);
    expect(await exists(join(output, 'old'))).toBe(false);
    expect(await exists(join(output, 'menu', 'main.js'))).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('previous');
    expect(warnings[0]).toContain('injected backup cleanup failure');
  });

  test('restores the old published mods when publishing the staged tree fails', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await mkdir(join(output, 'old'), { recursive: true });
    await writeFile(join(output, 'old', 'main.js'), 'old bundle\n');

    const before = await readTree(output);

    const failure = await buildMods(source, output, {
      renamePath: async (from, to) => {
        if (from.includes('.staging-') && to === resolvePath(output)) {
          throw new Error('injected publish failure');
        }

        await rename(from, to);
      },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(messageOf(failure)).toContain('injected publish failure');
    expect(await readTree(output)).toEqual(before);
    expect(await readdir(dirname(output))).toEqual(['mods']);
  });

  test('names the kept previous tree and both errors when publishing and restoring fail', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await mkdir(join(output, 'old'), { recursive: true });
    await writeFile(join(output, 'old', 'main.js'), 'old bundle\n');

    const failure = await buildMods(source, output, {
      renamePath: async (from, to) => {
        if (from.includes('.staging-') && to === resolvePath(output)) {
          throw new Error('injected publish failure');
        }

        if (from.includes('.previous-') && to === resolvePath(output)) {
          throw new Error('injected restore failure');
        }

        await rename(from, to);
      },
    }).catch((error: unknown) => error);

    const kept = (await readdir(dirname(output))).filter((name) =>
      name.startsWith('mods.previous-'),
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect(kept).toHaveLength(1);
    expect(messageOf(failure)).toContain(join(dirname(output), kept[0] ?? ''));
    expect(messageOf(failure)).toContain('injected publish failure');
    expect(messageOf(failure)).toContain('injected restore failure');
  });

  test('removes leftover staging and previous trees before the next build', async () => {
    await writeSource('menu/main.ts', 'export const menu = 1;\n');

    const leftoverStaging = join(dirname(output), 'mods.staging-leftover');
    const leftoverPrevious = join(dirname(output), 'mods.previous-leftover');

    await mkdir(leftoverStaging, { recursive: true });
    await mkdir(leftoverPrevious, { recursive: true });
    await writeFile(join(leftoverPrevious, 'main.js'), 'stranded bundle\n');

    await buildMods(source, output);

    expect(await readdir(dirname(output))).toEqual(['mods']);
  });

  test('publishes the built tree with the default directory mode', async () => {
    const reference = join(root, 'reference');

    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await mkdir(reference);

    await buildMods(source, output);

    expect((await stat(output)).mode & 0o777).toBe((await stat(reference)).mode & 0o777);
  });

  test('builds nothing when there is no mods folder', async () => {
    expect(await buildMods(source, output)).toEqual([]);
  });
});
