import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { CheckResult } from '../scripts/install.ts';
import { install } from '../scripts/install.ts';
import type { IdentityOptions } from '../scripts/sandboxIdentity.ts';
import { findIdentityFailures, identityReport } from '../scripts/sandboxIdentity.ts';

let root: string;
let home: string;
let checkout: string;
let options: IdentityOptions;

const recordPath = (): string => join(home, '.koja-install.json');

const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const passingCheck = async (): Promise<CheckResult> => ({ passed: true, output: 'passed' });

const failingCheck = async (): Promise<CheckResult> => ({ passed: false, output: 'failed' });

const installFrom = async (
  from: string,
  check: () => Promise<CheckResult> = passingCheck,
): Promise<void> => {
  await install({
    home,
    checkout: from,
    modsDirectory: join(from, 'dist', 'mods'),
    configDirectory: join(from, 'config'),
    check,
  });
};

const writeCheckout = async (folder: string): Promise<void> => {
  await writeAt(join(folder, 'src', 'mods', 'koja-tabs', 'main.ts'), 'export default 1;\n');
  await writeAt(join(folder, 'src', 'mods', 'koja-tabs', 'main.test.ts'), 'export {};\n');
  await writeAt(join(folder, 'src', 'kit', 'icons', 'x.svg'), '<svg/>\n');
  await writeAt(join(folder, 'config', 'keys.json'), '{ "global": {} }\n');
  await writeAt(join(folder, 'config', 'layouts', 'koja.json'), '{ "id": "root" }\n');
  await writeAt(join(folder, 'scripts', 'build.ts'), 'export {};\n');
  await writeAt(join(folder, 'scripts', 'install.ts'), 'export {};\n');
  await writeAt(join(folder, 'package.json'), '{}\n');
  await writeAt(join(folder, 'bun.lock'), '{}\n');
  await writeAt(join(folder, 'dist', 'mods', 'koja-tabs', 'main.js'), 'export default 1;\n');
  await writeAt(join(folder, 'dist', 'mods', 'koja-tabs', 'icons', 'x.svg'), '<svg/>\n');
};

const touchAfterInstall = async (path: string): Promise<void> => {
  const record = await stat(recordPath());
  const later = new Date(record.mtimeMs + 60_000);

  await utimes(path, later, later);
};

// A file system stamps a folder with a coarse clock, so an install and a change right after it
// can share one time. Moving the install into the past keeps the two apart.
const ageInstall = async (): Promise<void> => {
  const record = await stat(recordPath());
  const earlier = new Date(record.mtimeMs - 3_600_000);
  const entries = await readdir(checkout, { recursive: true });

  await Promise.all(
    [recordPath(), ...entries.map((entry) => join(checkout, entry))].map(async (path) =>
      utimes(path, earlier, earlier),
    ),
  );
};

const snapshot = async (folder: string): Promise<string[]> => {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });

  const lines = await Promise.all(
    entries.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      const entryStat = await stat(path);
      const content = entry.isFile() ? await readFile(path, 'base64') : '';

      return `${path} ${entryStat.mode} ${entryStat.mtimeMs} ${content}`;
    }),
  );

  return lines.toSorted();
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-identity-'));
  home = join(root, 'sandbox', 'config', 'herdr-app');
  checkout = join(root, 'checkout');
  options = { name: 'koja', home, checkout, window: 'answers' };

  await mkdir(home, { recursive: true });
  await writeCheckout(checkout);
  await installFrom(checkout);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('sandbox identity', () => {
  test('passes with one line naming the sandbox and the checkout', async () => {
    const report = await identityReport(options);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toContain('koja');
    expect(report.lines[0]).toContain(checkout);
  });

  test('fails when the sandbox is not up', async () => {
    expect(await findIdentityFailures({ ...options, window: 'notUp' })).toEqual([
      { kind: 'sandboxNotUp' },
    ]);
  });

  test('fails when the window does not answer', async () => {
    expect(await findIdentityFailures({ ...options, window: 'silent' })).toEqual([
      { kind: 'windowSilent' },
    ]);
  });

  test('fails when the install record is missing', async () => {
    await rm(recordPath());

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'recordMissing' }]);
  });

  test('fails when the record names no checkout and no check result', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as { files: string[] };

    await writeFile(recordPath(), JSON.stringify({ version: 1, files: record.files }));

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'recordWithoutOrigin' }]);
  });

  test('fails when another checkout with the same files installed last', async () => {
    const other = join(root, 'other');

    await writeCheckout(other);
    await installFrom(other);

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'otherCheckout', installedFrom: other },
    ]);
  });

  test('passes for a checkout reached through a symlink', async () => {
    const linked = join(root, 'linked');

    await symlink(checkout, linked);

    expect(await findIdentityFailures({ ...options, checkout: linked })).toEqual([]);
  });

  test('fails when a mod check failed in the last install', async () => {
    await rm(home, { recursive: true });
    await mkdir(home, { recursive: true });
    await installFrom(checkout, failingCheck);

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'checkFailed' },
      { kind: 'notInstalled', path: 'config/keys.json' },
      { kind: 'notInstalled', path: 'config/layouts/koja.json' },
    ]);
  });

  test('fails when a built mod file has no installed copy', async () => {
    await writeAt(join(checkout, 'dist', 'mods', 'koja-menu', 'main.js'), 'export default 2;\n');

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'notInstalled', path: 'dist/mods/koja-menu/main.js' },
    ]);
  });

  test('fails when a built mod file differs from its installed copy', async () => {
    await writeFile(join(checkout, 'dist', 'mods', 'koja-tabs', 'main.js'), 'export default 2;\n');

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'differs', path: 'dist/mods/koja-tabs/main.js' },
    ]);
  });

  test('fails when an installed config file was edited in Herdr home', async () => {
    await writeFile(join(home, 'keys.json'), '{ "global": { "ctrl-b": "other" } }\n');

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'differs', path: 'config/keys.json' },
    ]);
  });

  test('fails when an installed file has another mode', async () => {
    await chmod(join(home, 'mods', 'koja-tabs', 'main.js'), 0o755);

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'differs', path: 'dist/mods/koja-tabs/main.js' },
    ]);
  });

  test('fails when an installed mod file is missing from the build', async () => {
    await rm(join(checkout, 'dist', 'mods', 'koja-tabs', 'icons'), { recursive: true });

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'noSource', path: 'mods/koja-tabs/icons/x.svg' },
    ]);
  });

  test('ignores a file in Herdr home that the installer never wrote', async () => {
    await writeAt(join(home, 'mods', 'koja-tabs', 'gpui-kit.d.ts'), 'declare module "x";\n');

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test.each([
    'src/mods/koja-tabs/main.ts',
    'src/kit/icons/x.svg',
    'config/layouts/koja.json',
    'scripts/build.ts',
    'scripts/install.ts',
    'package.json',
    'bun.lock',
  ])('fails when %s changed after the install', async (path) => {
    await touchAfterInstall(join(checkout, path));

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'changedSinceInstall', path }]);
  });

  test('passes when an input is exactly as old as the record', async () => {
    // Whole milliseconds in the past could sort before a file written in the same millisecond.
    const installedAt = new Date(Date.now() + 60_000);

    await utimes(recordPath(), installedAt, installedAt);
    await utimes(join(checkout, 'package.json'), installedAt, installedAt);

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('passes when only a test file changed after the install', async () => {
    await touchAfterInstall(join(checkout, 'src', 'mods', 'koja-tabs', 'main.test.ts'));

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test.each([
    ['src/mods/koja-tabs/main.ts', 'src/mods/koja-tabs'],
    ['src/kit/icons/x.svg', 'src/kit/icons'],
    ['config/layouts/koja.json', 'config/layouts'],
    ['config/keys.json', 'config'],
  ])('fails when %s was deleted after the install', async (path, folder) => {
    await ageInstall();
    await rm(join(checkout, path));

    const failures = await findIdentityFailures(options);

    expect(failures).toContainEqual({ kind: 'changedSinceInstall', path: folder });
  });

  test('fails when a file was added under src after the install', async () => {
    await ageInstall();
    await writeFile(join(checkout, 'src', 'kit', 'icons', 'plus.svg'), '<svg/>\n');

    const failures = await findIdentityFailures(options);

    expect(failures).toContainEqual({ kind: 'changedSinceInstall', path: 'src/kit/icons' });
  });

  test('passes when a test file was edited in place after the install', async () => {
    await ageInstall();
    await writeFile(join(checkout, 'src', 'mods', 'koja-tabs', 'main.test.ts'), 'export {};\n\n');

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('names the folder of a deleted input on its own line', async () => {
    await ageInstall();
    await rm(join(checkout, 'src', 'kit', 'icons', 'x.svg'));

    const report = await identityReport(options);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toContain('src/kit/icons');
  });

  test('passes when a shipped input file does not exist', async () => {
    await rm(join(checkout, 'bun.lock'));

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('reports every failed reason, each on its own line', async () => {
    await writeFile(join(checkout, 'dist', 'mods', 'koja-tabs', 'main.js'), 'export default 2;\n');
    await touchAfterInstall(join(checkout, 'package.json'));

    const report = await identityReport({ ...options, window: 'silent' });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toHaveLength(3);
    expect(report.lines.every((line) => !line.includes('\n'))).toBe(true);
    expect(report.lines[1]).toContain('dist/mods/koja-tabs/main.js');
    expect(report.lines[2]).toContain('package.json');
  });

  test('gives a sandbox that is down, a missing record, and an old record their own lines', async () => {
    const down = await identityReport({ ...options, window: 'notUp' });

    await writeFile(recordPath(), JSON.stringify({ version: 1, files: [] }));

    const old = await identityReport(options);

    await rm(recordPath());

    const missing = await identityReport(options);
    const lines = [...down.lines, ...old.lines, ...missing.lines];

    expect([down.exitCode, old.exitCode, missing.exitCode]).toEqual([1, 1, 1]);
    expect(lines).toHaveLength(3);
    expect(new Set(lines).size).toBe(3);
  });

  test.each([
    ['passes', async (): Promise<void> => undefined],
    [
      'fails',
      async (): Promise<void> => {
        await writeFile(join(home, 'keys.json'), '{ "edited": true }\n');
        await touchAfterInstall(join(checkout, 'package.json'));
      },
    ],
  ])('writes nothing when it %s', async (_, arrange) => {
    await arrange();

    const before = await snapshot(root);

    await identityReport(options);

    expect(await snapshot(root)).toEqual(before);
  });
});

describe('scripts/sandbox identity', () => {
  const script = resolve(import.meta.dir, '..', 'scripts', 'sandbox');
  let name: string;
  let sandboxRoot: string;

  const runIdentity = async (): Promise<{ exitCode: number; output: string }> => {
    const child = Bun.spawn([script, 'identity'], {
      env: { ...Bun.env, RUTA_NAME: name },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    return { exitCode, output };
  };

  const writeWindow = async (exitCode: number): Promise<void> => {
    const binary = join(sandboxRoot, 'bin', 'herdr-app');

    await writeAt(binary, `#!/bin/sh\nexit ${exitCode}\n`);
    await chmod(binary, 0o755);
  };

  beforeEach(() => {
    name = `koja-identity-test-${randomBytes(6).toString('hex')}`;
    sandboxRoot = join('/var/tmp', `ruta-${name}`);
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  test('exits 1 and says the named sandbox is not up when it has no folder', async () => {
    const result = await runIdentity();

    expect(result.exitCode).toBe(1);
    expect(result.output.trim().split('\n')).toHaveLength(1);
    expect(result.output).toContain(name);
  });

  test('reports a silent window and a missing record of a sandbox whose window fails', async () => {
    await writeWindow(1);

    const silent = await runIdentity();

    await writeWindow(0);

    const answering = await runIdentity();

    expect(silent.exitCode).toBe(1);
    expect(silent.output.trim().split('\n')).toHaveLength(2);
    expect(answering.exitCode).toBe(1);
    expect(answering.output.trim().split('\n')).toHaveLength(1);
    expect(silent.output).toContain(answering.output);
    expect(answering.output).toContain(join(sandboxRoot, 'config', 'herdr-app'));
  });

  test('creates nothing in the sandbox folder', async () => {
    await writeWindow(0);

    const before = await snapshot(sandboxRoot);

    await runIdentity();

    expect(await snapshot(sandboxRoot)).toEqual(before);
  });
});
