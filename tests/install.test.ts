import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

import { acquireCheckoutLock, acquireFileLock } from '../scripts/fileLock.ts';
import type { CheckResult } from '../scripts/install.ts';
import { filesUnder, install, readRecord, shippedInputs, trustedRoot } from '../scripts/install.ts';
import { findIdentityFailures } from '../scripts/sandboxIdentity.ts';

let root: string;
let home: string;
let mods: string;
let config: string;
let checked: string[];

const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const passingCheck = async (folder: string): Promise<CheckResult> => {
  checked.push(folder);

  return { passed: true, output: `check passed: ${folder}` };
};

const run = async (
  check: (folder: string) => Promise<CheckResult> = passingCheck,
): ReturnType<typeof install> =>
  install({
    home,
    checkout: root,
    inputs: [],
    modsDirectory: mods,
    configDirectory: config,
    check,
  });

const exists = async (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

const snapshotHome = async (): Promise<Record<string, string>> => {
  const files = await filesUnder(home);

  const entries = await Promise.all(
    files.map(
      async (file) => [file, (await readFile(join(home, file))).toString('base64')] as const,
    ),
  );

  return Object.fromEntries(entries);
};

const fixtureText = async (name: string): Promise<string> =>
  readFile(join('tests', 'fixtures', name), 'utf8');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-install-'));
  home = join(root, 'herdr-app');
  mods = join(root, 'dist', 'mods');
  config = join(root, 'config');
  checked = [];

  await mkdir(home, { recursive: true });
  await writeAt(join(mods, 'koja-tabs', 'main.js'), 'export default 1;\n');
  await writeAt(join(mods, 'koja-tabs', 'icons', 'x.svg'), '<svg/>\n');
  await writeAt(join(config, 'keys.json'), '{ "global": {} }\n');
  await writeAt(join(config, 'layouts', 'koja.json'), '{ "id": "root" }\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('install', () => {
  test('copies the built mods and the config files into Herdr home', async () => {
    await run();

    expect(await readFile(join(home, 'mods', 'koja-tabs', 'main.js'), 'utf8')).toBe(
      'export default 1;\n',
    );

    expect(await readFile(join(home, 'mods', 'koja-tabs', 'icons', 'x.svg'), 'utf8')).toBe(
      '<svg/>\n',
    );

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('{ "global": {} }\n');
    expect(await readFile(join(home, 'layouts', 'koja.json'), 'utf8')).toBe('{ "id": "root" }\n');
  });

  test('keeps the mode of each file', async () => {
    await writeAt(join(mods, 'koja-tabs', 'preview.sh'), '#!/bin/sh\n');
    await chmod(join(mods, 'koja-tabs', 'preview.sh'), 0o755);

    await run();

    const installed = await stat(join(home, 'mods', 'koja-tabs', 'preview.sh'));

    expect(installed.mode & 0o777).toBe(0o755);
  });

  test('replaces a symlink with a real file and leaves its target alone', async () => {
    const dotfile = join(root, 'dotfiles', 'keys.json');

    await writeAt(dotfile, '{ "old": true }\n');
    await symlink(dotfile, join(home, 'keys.json'));

    await run();

    const installed = await lstat(join(home, 'keys.json'));

    expect(installed.isSymbolicLink()).toBe(false);
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('{ "global": {} }\n');
    expect(await readFile(dotfile, 'utf8')).toBe('{ "old": true }\n');
  });

  test('refuses to write through a symlinked folder and writes nothing there', async () => {
    const elsewhere = join(root, 'elsewhere');

    await mkdir(elsewhere);
    await symlink(elsewhere, join(home, 'layouts'));

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(join(home, 'layouts')));
    expect(await exists(join(elsewhere, 'koja.json'))).toBe(false);
  });

  test('refuses a symlinked Herdr home and changes nothing inside or outside it', async () => {
    const target = await mkdtemp(join(tmpdir(), 'koja-install-target-'));

    try {
      await writeAt(join(target, 'mods', 'old', 'main.js'), 'keep\n');

      await writeFile(
        join(target, '.koja-install.json'),
        JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
      );

      await rm(home, { recursive: true });
      await symlink(target, home);

      const failure: unknown = await run().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', expect.stringContaining(home));
      expect(await readFile(join(target, 'mods', 'old', 'main.js'), 'utf8')).toBe('keep\n');
      expect((await readdir(target)).toSorted()).toEqual(['.koja-install.json', 'mods']);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test('refuses a symlinked Herdr home given with a trailing slash', async () => {
    const target = await mkdtemp(join(tmpdir(), 'koja-install-target-'));

    try {
      await writeAt(join(target, 'mods', 'old', 'main.js'), 'keep\n');

      await writeFile(
        join(target, '.koja-install.json'),
        JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
      );

      await rm(home, { recursive: true });
      await symlink(target, home);

      const failure: unknown = await install({
        home: `${home}/`,
        checkout: root,
        inputs: [],
        modsDirectory: mods,
        configDirectory: config,
        check: passingCheck,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', expect.stringContaining(home));
      expect(await readFile(join(target, 'mods', 'old', 'main.js'), 'utf8')).toBe('keep\n');
      expect((await readdir(target)).toSorted()).toEqual(['.koja-install.json', 'mods']);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test('refuses a symlinked ancestor of Herdr home', async () => {
    const actual = join(root, 'actual');
    const linked = join(root, 'linked');

    await mkdir(actual);
    await symlink(actual, linked);

    const linkedHome = join(linked, 'herdr-app');

    await mkdir(join(actual, 'herdr-app'));

    const failure: unknown = await install({
      home: linkedHome,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(linkedHome));
    expect(await exists(join(actual, 'herdr-app', 'keys.json'))).toBe(false);
  });

  test('records an incomplete install when a config write fails after the mod checks pass', async () => {
    await writeAt(join(config, 'extra.json'), 'extra\n');

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      chmodFile: async (path) => {
        if (path.includes('keys.json')) {
          throw new Error('injected chmod failure');
        }
      },
    }).catch((error: unknown) => error);

    const record = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8')) as {
      allChecksPassed: boolean;
      completed: boolean;
      files: string[];
    };

    expect(failure).toBeInstanceOf(Error);
    expect(record.files).toContain('extra.json');
    expect(record.files).not.toContain('keys.json');
    expect(record.allChecksPassed).toBe(true);
    expect(record.completed).toBe(false);
    expect(await exists(join(home, 'keys.json'))).toBe(false);
  });

  test('keeps an earlier destination when chmod fails before publication', async () => {
    await run();

    const earlierKeys = await readFile(join(home, 'keys.json'), 'utf8');

    await writeFile(join(config, 'keys.json'), 'changed\n');

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      chmodFile: async (path) => {
        if (path.includes('keys.json')) {
          throw new Error('injected chmod failure');
        }
      },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe(earlierKeys);
  });

  test('replaces a hard-linked destination without changing the file outside Herdr home', async () => {
    const outside = join(root, 'outside-keys.json');

    await writeFile(outside, 'outside\n');
    await link(outside, join(home, 'keys.json'));

    await run();

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('{ "global": {} }\n');
    expect(await readFile(outside, 'utf8')).toBe('outside\n');
  });

  test.each([
    ['a noncanonical entry', ['./settings.json'], 'not canonical'],
    ['a trailing-separator entry', ['settings.json/'], 'not canonical'],
    ['a root-equivalent entry', ['.'], 'names Herdr home itself'],
    ['a dot-root entry', ['./'], 'names Herdr home itself'],
    ['an empty entry', [''], 'empty'],
    ['a duplicate entry', ['settings.json', 'settings.json'], 'more than once'],
  ])('rejects %s in a record before changing installed files', async (_, files, reason) => {
    await writeAt(join(home, 'settings.json'), 'user\n');

    await writeFile(join(home, '.koja-install.json'), JSON.stringify({ version: 1, files }));

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(reason));
    expect(await readFile(join(home, 'settings.json'), 'utf8')).toBe('user\n');
  });

  test('refuses a plan that names the install lock', async () => {
    await writeAt(join(config, '.koja-install.lock'), 'planned\n');

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining('.koja-install.lock'));
    expect(await readFile(join(home, '.koja-install.lock'), 'utf8')).toBe('');
  });

  test('refuses a record that names the install lock', async () => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['.koja-install.lock'] }),
    );

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining('.koja-install.lock'));
    expect(failure).toHaveProperty('message', expect.stringContaining('metadata'));
  });

  test('writes a record for an empty plan on a fresh home', async () => {
    const emptyMods = join(root, 'empty-mods');
    const emptyConfig = join(root, 'empty-config');

    await mkdir(emptyMods);
    await mkdir(emptyConfig);
    await rm(home, { recursive: true });

    const result = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: emptyMods,
      configDirectory: emptyConfig,
      check: passingCheck,
    });

    expect(result).toEqual({ written: [], removed: [], checks: [] });
    expect((await readRecord(home))?.files).toEqual([]);
  });

  test('fails without changing the home or running checks when the built mods are missing', async () => {
    await run();

    const before = await snapshotHome();

    await rm(mods, { recursive: true, force: true });
    await writeAt(join(config, 'keys.json'), '{ "changed": true }\n');
    checked = [];

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining('built mods'));
    expect(failure).toHaveProperty('message', expect.stringContaining(mods));
    expect(checked).toEqual([]);
    expect(await snapshotHome()).toEqual(before);
  });

  test('replaces an owned file with a directory before copying the new files', async () => {
    await writeAt(join(config, 'thing'), 'old file\n');
    await run();
    await rm(join(config, 'thing'));
    await writeAt(join(config, 'thing', 'nested.json'), 'nested\n');

    const result = await run();

    expect(await readFile(join(home, 'thing', 'nested.json'), 'utf8')).toBe('nested\n');
    expect(result.removed).toContain('thing');
  });

  test('replaces an owned directory with a file before copying it', async () => {
    await writeAt(join(config, 'thing', 'nested.json'), 'nested\n');
    await run();
    await rm(join(config, 'thing'), { recursive: true });
    await writeAt(join(config, 'thing'), 'new file\n');

    const result = await run();

    expect(await readFile(join(home, 'thing'), 'utf8')).toBe('new file\n');
    expect(result.removed).toContain('thing/nested.json');
  });

  test('refuses to replace a directory that holds an unowned file', async () => {
    await writeAt(join(config, 'thing', 'nested.json'), 'nested\n');
    await run();
    await writeAt(join(home, 'thing', 'user.txt'), 'user\n');
    await rm(join(config, 'thing'), { recursive: true });
    await writeAt(join(config, 'thing'), 'new file\n');

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);

    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining(join(home, 'thing', 'user.txt')),
    );

    expect(await readFile(join(home, 'thing', 'user.txt'), 'utf8')).toBe('user\n');
    expect((await lstat(join(home, 'thing'))).isDirectory()).toBe(true);
  });

  test('refuses to replace a directory that holds an unowned dangling symlink', async () => {
    await writeAt(join(config, 'thing', 'nested.json'), 'nested\n');
    await run();
    await symlink(join(root, 'missing-target'), join(home, 'thing', 'dangling'));
    await rm(join(config, 'thing'), { recursive: true });
    await writeAt(join(config, 'thing'), 'new file\n');

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);

    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining(join(home, 'thing', 'dangling')),
    );

    expect((await lstat(join(home, 'thing', 'dangling'))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(home, 'thing', 'nested.json'), 'utf8')).toBe('nested\n');
  });

  test('records every planned file it matched when the earlier record lost them', async () => {
    await run();
    await rm(join(home, '.koja-install.json'));

    const result = await run();

    const expected = [
      'keys.json',
      'layouts/koja.json',
      'mods/koja-tabs/icons/x.svg',
      'mods/koja-tabs/main.js',
    ].toSorted();

    expect(result.written).toEqual([]);
    expect((await readRecord(home))?.files).toEqual(expected);

    await rm(join(mods, 'koja-tabs', 'icons', 'x.svg'));

    const next = await run();

    expect(next.removed).toContain('mods/koja-tabs/icons/x.svg');
  });

  test('removes files an earlier install wrote that the current one lacks', async () => {
    await writeAt(join(mods, 'koja-old', 'main.js'), 'export default 2;\n');
    await run();
    await rm(join(mods, 'koja-old'), { recursive: true });

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old'))).toBe(false);
  });

  test('leaves files it never wrote, even beside its own', async () => {
    await writeAt(join(home, 'mods', 'koja-tabs', 'gpui-kit.d.ts'), 'declare module "x";\n');
    await writeAt(join(home, 'mods', 'my-menu', 'main.js'), 'export default 3;\n');
    await writeAt(join(home, 'layouts', 'my-main.json'), '{}\n');

    await run();
    await rm(join(mods, 'koja-tabs'), { recursive: true });
    await run();

    expect(await exists(join(home, 'mods', 'koja-tabs', 'main.js'))).toBe(false);
    expect(await exists(join(home, 'mods', 'koja-tabs', 'gpui-kit.d.ts'))).toBe(true);
    expect(await exists(join(home, 'mods', 'my-menu', 'main.js'))).toBe(true);
    expect(await exists(join(home, 'layouts', 'my-main.json'))).toBe(true);
  });

  test('never removes a path outside Herdr home that its record names', async () => {
    const outside = join(root, 'outside.txt');

    await writeFile(outside, 'keep\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['../outside.txt', outside] }),
    );

    await run();

    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('keeps a stale file when its parent folder is a symlink', async () => {
    const elsewhere = join(root, 'elsewhere');
    const outside = join(elsewhere, 'main.js');

    await writeAt(outside, 'keep\n');
    await mkdir(join(home, 'mods'), { recursive: true });
    await symlink(elsewhere, join(home, 'mods', 'old'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('keeps earlier destinations when a later destination is rejected', async () => {
    const dotfile = join(root, 'dotfiles', 'keys.json');
    const elsewhere = join(root, 'elsewhere');

    await writeAt(dotfile, '{ "old": true }\n');
    await mkdir(elsewhere);
    await symlink(dotfile, join(home, 'keys.json'));
    await mkdir(join(home, 'mods'), { recursive: true });
    await symlink(elsewhere, join(home, 'mods', 'old'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const failure: unknown = await run().catch((error: unknown) => error);
    const installed = await lstat(join(home, 'keys.json'));

    expect(failure).toBeInstanceOf(Error);
    expect(installed.isSymbolicLink()).toBe(true);
    expect(await readFile(dotfile, 'utf8')).toBe('{ "old": true }\n');
    expect(await exists(join(elsewhere, 'main.js'))).toBe(false);
  });

  test('removes a stale symlink, reports it, and cleans its folder', async () => {
    const elsewhere = join(root, 'elsewhere');
    const outside = join(elsewhere, 'main.js');

    await writeAt(outside, 'keep\n');
    await mkdir(join(home, 'mods', 'old'), { recursive: true });
    await symlink(outside, join(home, 'mods', 'old', 'main.js'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const result = await run();

    expect(result.removed).toContain('mods/old/main.js');
    expect(await exists(join(home, 'mods', 'old', 'main.js'))).toBe(false);
    expect(await exists(join(home, 'mods', 'old'))).toBe(false);
    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('does not read or write through a symlinked record', async () => {
    const externalRecord = join(root, 'external-record.json');
    const externalText = `${JSON.stringify({ version: 1, files: ['mods/keep/main.js'] })}\n`;

    await writeAt(join(home, 'mods', 'keep', 'main.js'), 'keep\n');
    await writeFile(externalRecord, externalText);
    await symlink(externalRecord, join(home, '.koja-install.json'));

    await run();

    expect(await readFile(join(home, 'mods', 'keep', 'main.js'), 'utf8')).toBe('keep\n');
    expect(await readFile(externalRecord, 'utf8')).toBe(externalText);

    const record = await lstat(join(home, '.koja-install.json'));

    const written = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8')) as {
      files: string[];
    };

    expect(record.isSymbolicLink()).toBe(false);
    expect(written.files).toContain('mods/koja-tabs/main.js');
  });

  test('writes the record through a unique temporary path', async () => {
    const fixedPath = join(home, '.koja-install.json.tmp');

    await mkdir(fixedPath);
    await writeFile(join(config, 'keys.json'), 'changed\n');

    const result = await run();

    const leftovers = (await readdir(home)).filter(
      (name) =>
        name.startsWith('.koja-install.json.') &&
        name.endsWith('.tmp') &&
        name !== '.koja-install.json.tmp',
    );

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('changed\n');
    expect(result.written).toContain('keys.json');
    expect((await readRecord(home))?.files).toContain('keys.json');
    expect(await exists(fixedPath)).toBe(true);
    expect(leftovers).toEqual([]);
  });

  test('preserves the earlier record when publication fails and allows a retry', async () => {
    await run();

    const recordPath = join(home, '.koja-install.json');
    const earlierText = await readFile(recordPath, 'utf8');

    await writeFile(join(config, 'keys.json'), 'changed\n');

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      writeRecordFile: async () => {
        throw new Error('injected publication failure');
      },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);

    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining('injected publication failure'),
    );

    expect(await readFile(recordPath, 'utf8')).toBe(earlierText);

    await run();

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('changed\n');
  });

  test('removes an abandoned temporary record when publication fails', async () => {
    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      writeRecordFile: async (path, text) => {
        await writeFile(path, text, { flag: 'wx' });

        throw new Error('injected publication failure');
      },
    }).catch((error: unknown) => error);

    const leftovers = (await readdir(home)).filter(
      (name) => name.startsWith('.koja-install.json.') && name.endsWith('.tmp'),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(leftovers).toEqual([]);
  });

  test('does not write through a symlinked temporary record', async () => {
    const externalRecord = join(root, 'external-temporary-record.json');
    const temporaryName = '.koja-install.json.symlink.tmp';

    await writeFile(externalRecord, 'keep\n');
    await symlink(externalRecord, join(home, temporaryName));

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      temporaryRecordName: () => temporaryName,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(externalRecord, 'utf8')).toBe('keep\n');
    expect(await exists(join(home, temporaryName))).toBe(false);
  });

  test('gives up on a home lock another installer holds, and takes it once that install releases', async () => {
    const lockPath = join(home, '.koja-install.lock');

    await run();

    const release = await acquireFileLock(lockPath);

    try {
      const blocked: unknown = await install({
        home,
        checkout: root,
        inputs: [],
        modsDirectory: mods,
        configDirectory: config,
        check: passingCheck,
        lockTimeoutMilliseconds: 50,
      }).catch((error: unknown) => error);

      expect(blocked).toBeInstanceOf(Error);
      expect(blocked).toHaveProperty('message', expect.stringContaining(lockPath));
      expect(blocked).toHaveProperty('message', expect.stringContaining('Stop other installs'));
    } finally {
      await release();
    }

    const result = await run();

    expect(result.written).toEqual([]);
  });

  test('waits for the checkout lock before reading the built mods', async () => {
    let signalWaiting!: () => void;

    const waiting = new Promise<void>((resolve) => {
      signalWaiting = resolve;
    });

    const release = await acquireCheckoutLock(root);

    const pending = install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      onCheckoutLockWait: signalWaiting,
    });

    try {
      await Promise.race([
        waiting,
        pending.then(() => {
          throw new Error('The install did not wait for the checkout lock');
        }),
      ]);

      expect(checked).toEqual([]);
    } finally {
      await release();
    }

    const result = await pending;

    expect(result.checks).toHaveLength(1);
  });

  test('takes the checkout lock before the home lock for ordinary and sandbox installs', async () => {
    await run();

    let signalWaiting!: () => void;

    const waiting = new Promise<void>((resolve) => {
      signalWaiting = resolve;
    });

    const releaseCheckout = await acquireCheckoutLock(root);

    let ordinaryFinished = false;

    const ordinary = install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      onCheckoutLockWait: signalWaiting,
    }).then((result) => {
      ordinaryFinished = true;

      return result;
    });

    try {
      await Promise.race([
        waiting,
        ordinary.then(() => {
          throw new Error('The ordinary install did not wait for the checkout lock');
        }),
      ]);

      expect(ordinaryFinished).toBe(false);

      const sandbox = await install({
        home,
        checkout: root,
        inputs: [],
        modsDirectory: mods,
        configDirectory: config,
        check: passingCheck,
        checkoutLockHeld: true,
        lockTimeoutMilliseconds: 1_000,
      });

      expect(sandbox.checks).toHaveLength(1);
    } finally {
      await releaseCheckout();
    }

    const result = await ordinary;

    expect(result.checks).toHaveLength(1);
  });

  test('rejects a broken live record without changing installed files', async () => {
    await run();

    const recordPath = join(home, '.koja-install.json');
    const earlierKeys = await readFile(join(home, 'keys.json'), 'utf8');

    await writeFile(recordPath, '{"files":');
    await writeFile(join(config, 'keys.json'), 'changed\n');

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SyntaxError);
    expect(await readFile(recordPath, 'utf8')).toBe('{"files":');
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe(earlierKeys);
  });

  test('leaves an unchanged file in place', async () => {
    await run();

    const before = await stat(join(home, 'keys.json'));
    const result = await run();
    const after = await stat(join(home, 'keys.json'));

    expect(result.written).toEqual([]);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test('records files written before a later failure so a retry can remove them', async () => {
    await writeAt(join(config, 'extra.json'), 'orphan\n');

    await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      chmodFile: async (path) => {
        if (path.includes('keys.json')) {
          throw new Error('injected chmod failure');
        }
      },
    }).catch(() => undefined);

    await rm(join(config, 'extra.json'));

    const result = await run();

    expect(result.removed).toContain('extra.json');
    expect(await exists(join(home, 'extra.json'))).toBe(false);
  });

  test('keeps a user file at a plan the installer never reached', async () => {
    const smallConfig = join(root, 'small-config');
    const smallMods = join(root, 'small-mods');

    await writeAt(join(smallConfig, 'a.json'), 'new a\n');
    await writeAt(join(smallConfig, 'z.json'), 'new z\n');
    await mkdir(smallMods);

    const first = 'a.json';
    const second = 'z.json';

    await mkdir(join(home, first), { recursive: true });
    await writeAt(join(home, first, 'user.txt'), 'user data\n');
    await writeAt(join(home, second), 'user data\n');

    const options = {
      home,
      checkout: root,
      inputs: [],
      modsDirectory: smallMods,
      configDirectory: smallConfig,
      check: passingCheck,
    };

    const failure: unknown = await install(options).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);

    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining(join(home, first, 'user.txt')),
    );

    expect(await readFile(join(home, second), 'utf8')).toBe('user data\n');

    await rm(join(home, first), { recursive: true, force: true });
    await rm(join(smallConfig, second));

    await install(options);

    expect(await readFile(join(home, second), 'utf8')).toBe('user data\n');
  });

  test('prefers the user home root over a nested temporary folder', () => {
    const userHome = '/home/me';
    const temporary = '/home/me/linked/temporary';

    expect(trustedRoot('/home/me/linked/temporary/herdr-app', userHome, temporary)).toBe(userHome);
  });

  test('uses the temporary root when the home is only inside it', () => {
    expect(trustedRoot('/tmp/work/herdr-app', '/home/me', '/tmp/work')).toBe('/tmp/work');
  });

  test('uses the filesystem root when the home is outside both roots', () => {
    expect(trustedRoot('/opt/herdr-app', '/home/me', '/tmp/work')).toBe('/');
  });

  test('refuses a linked folder inside the user home above a nested temporary folder', async () => {
    const userHome = join(root, 'user');
    const actual = join(root, 'actual');
    const linked = join(userHome, 'linked');
    const temporary = join(linked, 'temporary');

    await mkdir(userHome);
    await mkdir(join(actual, 'temporary', 'herdr-app'), { recursive: true });
    await symlink(actual, linked);

    const failure: unknown = await install({
      home: join(temporary, 'herdr-app'),
      roots: { userHome, temporary },
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(linked));
    expect(await exists(join(actual, 'temporary', 'herdr-app', 'keys.json'))).toBe(false);
  });

  test('records the checkout it installed from and that every mod check passed', async () => {
    await run();

    const record: unknown = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8'));

    expect(record).toMatchObject({ checkout: root, allChecksPassed: true });
  });

  test('records that a mod check failed', async () => {
    await run(async () => ({ passed: false, output: 'failed' }));

    const record: unknown = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8'));

    expect(record).toMatchObject({ checkout: root, allChecksPassed: false });
  });

  test('lists the shipped inputs of a checkout with their hashes, without test files and built mods', async () => {
    await writeAt(join(root, 'src', 'kit', 'row.ts'), 'export {};\n');
    await writeAt(join(root, 'src', 'kit', 'row.test.ts'), 'export {};\n');
    await writeAt(join(root, 'package.json'), '{}\n');

    const inputs = await shippedInputs(root);
    const paths = inputs.map((input) => input.path).toSorted();
    const row = inputs.find((input) => input.path === 'src/kit/row.ts');
    const rowHash = createHash('sha256').update('export {};\n').digest('hex');

    expect(paths).toEqual([
      'config/keys.json',
      'config/layouts/koja.json',
      'package.json',
      'src/kit/row.ts',
    ]);

    expect(row?.hash).toBe(rowHash);
  });

  test('skips a shipped input that does not exist', async () => {
    await writeAt(join(root, 'package.json'), '{}\n');

    const inputs = await shippedInputs(root);

    expect(inputs.map((input) => input.path)).not.toContain('bun.lock');
  });

  test('records the shipped inputs it was given, not the files of the checkout', async () => {
    const inputs = [
      { path: 'package.json', hash: 'aaaa' },
      { path: 'config/keys.json', hash: 'bbbb' },
    ];

    await install({
      home,
      checkout: root,
      inputs,
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    });

    const record = await readRecord(home);

    expect(record?.origin?.inputs).toEqual([
      { path: 'config/keys.json', hash: 'bbbb' },
      { path: 'package.json', hash: 'aaaa' },
    ]);
  });

  test.each([
    ['a plain list of paths', ['package.json']],
    ['an input without a hash', [{ path: 'package.json', modifiedAt: 2 }]],
    ['an input without a path', [{ hash: 'aaaa' }]],
    ['no list', { path: 'package.json', hash: 'aaaa' }],
  ])('reads a record that holds %s as a record without origin', async (_, inputs) => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, checkout: root, allChecksPassed: true, inputs, files: [] }),
    );

    expect(await readRecord(home)).toEqual({ files: [], checkout: root, origin: null });
  });

  test.each([
    ['no checkout', {}],
    ['a checkout that is not a string', { checkout: 2 }],
    ['a checkout that is not an absolute path', { checkout: 'koja' }],
  ])('reads a record with %s as a record without a checkout', async (_, fields) => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, allChecksPassed: true, inputs: [], files: [], ...fields }),
    );

    expect(await readRecord(home)).toEqual({ files: [], checkout: null, origin: null });
  });

  test('runs on a home whose record holds a plain list of input paths', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        inputs: ['package.json'],
        files: ['mods/koja-old/main.js'],
      }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
  });

  test('reads a record without shipped inputs as a record without origin', async () => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        files: ['keys.json'],
      }),
    );

    expect(await readRecord(home)).toEqual({ files: ['keys.json'], checkout: root, origin: null });
  });

  test('removes a stale file named by a record without shipped inputs', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        files: ['mods/koja-old/main.js'],
      }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old', 'main.js'))).toBe(false);
  });

  test('removes a stale file named by a record without a checkout or a check result', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/koja-old/main.js'] }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old', 'main.js'))).toBe(false);
  });

  test('keeps the record incomplete when staging cleanup fails', async () => {
    const inputs = await shippedInputs(root);

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs,
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      removeStaging: async () => {
        throw new Error('injected staging cleanup failure');
      },
    }).catch((error: unknown) => error);

    const record = await readRecord(home);

    const failures = await findIdentityFailures({
      name: 'koja',
      home,
      checkout: root,
      window: 'answers',
    });

    expect(failure).toBeInstanceOf(Error);
    expect(record?.origin?.completed).toBe(false);
    expect(record?.origin?.allChecksPassed).toBe(true);
    expect(failures).toEqual([{ kind: 'installIncomplete' }]);
  });

  test('keeps a complete record when an install fails before it changes anything', async () => {
    await run();

    const failure: unknown = await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: async () => {
        throw new Error('injected check failure');
      },
    }).catch((error: unknown) => error);

    const record = await readRecord(home);

    expect(failure).toBeInstanceOf(Error);
    expect(record?.origin?.completed).toBe(true);
    expect(record?.origin?.allChecksPassed).toBe(false);
  });

  test('removes the staging folder and half-copied file a killed install left behind', async () => {
    const staging = join(home, '.koja-check-leftover');
    const partial = join(home, '.keys.json.koja-01234567-89ab-cdef-0123-456789abcdef.tmp');

    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, 'main.js'), 'staged\n');
    await writeFile(partial, 'partial\n');

    await run();

    expect(await exists(staging)).toBe(false);
    expect(await exists(partial)).toBe(false);
  });

  test('writes install record version 3', async () => {
    await run();

    const record = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8')) as {
      completed: boolean;
      version: number;
    };

    expect(record.version).toBe(3);
    expect(record.completed).toBe(true);
  });

  test('reads a previous version 2 fixture without treating its success flag as completion', async () => {
    await writeFile(join(home, '.koja-install.json'), await fixtureText('install-record-v2.json'));

    expect(await readRecord(home)).toEqual({
      files: ['keys.json'],
      checkout: '/koja/checkout',
      origin: {
        checkout: '/koja/checkout',
        allChecksPassed: true,
        completed: false,
        inputs: [{ path: 'package.json', hash: 'aaaa' }],
      },
    });
  });

  test('reads a version 1 fixture as ownership without an origin', async () => {
    await writeFile(join(home, '.koja-install.json'), await fixtureText('install-record-v1.json'));

    expect(await readRecord(home)).toEqual({ files: ['keys.json'], checkout: null, origin: null });
  });

  test('reads a version 3 fixture with a complete origin', async () => {
    await writeFile(join(home, '.koja-install.json'), await fixtureText('install-record-v3.json'));

    expect(await readRecord(home)).toEqual({
      files: ['keys.json'],
      checkout: '/koja/checkout',
      origin: {
        checkout: '/koja/checkout',
        allChecksPassed: true,
        completed: true,
        inputs: [{ path: 'package.json', hash: 'aaaa' }],
      },
    });
  });

  test.each([
    [
      'without completion',
      { version: 3, checkout: '/koja/checkout', allChecksPassed: true, inputs: [], files: [] },
    ],
    [
      'with a non-boolean completion',
      {
        version: 3,
        checkout: '/koja/checkout',
        allChecksPassed: true,
        completed: 'yes',
        inputs: [],
        files: [],
      },
    ],
    [
      'without ownership files',
      {
        version: 3,
        checkout: '/koja/checkout',
        allChecksPassed: true,
        completed: true,
        inputs: [],
      },
    ],
    [
      'with malformed ownership files',
      {
        version: 3,
        checkout: '/koja/checkout',
        allChecksPassed: true,
        completed: true,
        inputs: [],
        files: 'keys.json',
      },
    ],
  ])('rejects a version 3 record %s as malformed', async (_, record) => {
    await writeFile(join(home, '.koja-install.json'), JSON.stringify(record));

    const failure: unknown = await readRecord(home).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining('malformed'));
  });

  test('rejects a newer record version with the update it needs', async () => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 99, files: ['keys.json'] }),
    );

    const failure: unknown = await readRecord(home).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining('99'));
    expect(failure).toHaveProperty('message', expect.stringContaining('newer'));
  });

  test('checks every installed mod and reports each result', async () => {
    await writeAt(join(mods, 'koja-menu', 'main.js'), 'export default 4;\n');

    const result = await run(async (folder) => {
      checked.push(folder);

      return { passed: !folder.endsWith('koja-menu'), output: `checked ${folder}` };
    });

    const checkedMods = checked.map((folder) => folder.split(sep).slice(-2).join(sep)).toSorted();
    const stagingRoots = (await readdir(home)).filter((name) => name.startsWith('.koja-check-'));

    expect(checkedMods).toEqual([join('mods', 'koja-menu'), join('mods', 'koja-tabs')]);
    expect(checked.every((folder) => folder.includes(`${sep}.koja-check-`))).toBe(true);
    expect(stagingRoots).toEqual([]);

    const failedMods = result.checks.filter((check) => !check.passed).map((check) => check.mod);

    expect(failedMods).toEqual(['koja-menu']);
  });
});

describe('filesUnder', () => {
  test.each([[['a.json', 'b.json', 'layouts/c.json']], [['layouts/c.json', 'b.json', 'a.json']]])(
    'lists the files in path order when they were written as %j',
    async (written) => {
      const folder = join(root, 'listed');

      for (const path of written) {
        await writeAt(join(folder, path), '');
      }

      expect(await filesUnder(folder)).toEqual(['a.json', 'b.json', 'layouts/c.json']);
    },
  );
});
