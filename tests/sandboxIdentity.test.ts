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
import { install, shippedInputs } from '../scripts/install.ts';
import type { IdentityFailure, IdentityOptions } from '../scripts/sandboxIdentity.ts';
import {
  findIdentityFailures,
  identityReport,
  nameHolderReport,
} from '../scripts/sandboxIdentity.ts';
import { replaceOnce } from './scriptCopy.ts';

interface InstallFromOptions {
  home?: string;
  check?: () => Promise<CheckResult>;
}

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

const installFrom = async (from: string, overrides: InstallFromOptions = {}): Promise<void> => {
  await install({
    home: overrides.home ?? home,
    checkout: from,
    inputs: await shippedInputs(from),
    modsDirectory: join(from, 'dist', 'mods'),
    configDirectory: join(from, 'config'),
    check: overrides.check ?? passingCheck,
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
  await writeAt(join(folder, 'scripts', 'checkoutLock.ts'), 'export {};\n');
  await writeAt(join(folder, 'package.json'), '{}\n');
  await writeAt(join(folder, 'bun.lock'), '{}\n');
  await writeAt(join(folder, 'dist', 'mods', 'koja-tabs', 'main.js'), 'export default 1;\n');
  await writeAt(join(folder, 'dist', 'mods', 'koja-tabs', 'icons', 'x.svg'), '<svg/>\n');
};

const rewriteAfterInstall = async (path: string): Promise<void> => {
  const content = await readFile(path, 'utf8');

  await writeFile(path, `${content}// changed\n`);
};

const shiftTime = async (path: string, milliseconds: number): Promise<void> => {
  const entry = await stat(path);
  const shifted = new Date(entry.mtimeMs + milliseconds);

  await utimes(path, shifted, shifted);
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

  test('fails when the window does not answer', async () => {
    expect(await findIdentityFailures({ ...options, window: 'silent' })).toEqual([
      { kind: 'windowSilent' },
    ]);
  });

  test('fails when the install record is missing', async () => {
    await rm(recordPath());

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'recordMissing' }]);
  });

  test('fails when the install record cannot be read', async () => {
    await writeFile(recordPath(), 'not a record\n');

    const failures = await findIdentityFailures(options);
    const report = await identityReport(options);

    expect(failures).toEqual([{ kind: 'recordUnreadable', path: recordPath() }]);
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(recordPath());
  });

  test('fails when the record names no checkout and no check result', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as { files: string[] };

    await writeFile(recordPath(), JSON.stringify({ version: 1, files: record.files }));

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'recordWithoutOrigin' }]);
  });

  test('fails when the record names its shipped inputs without their hashes', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as Record<string, unknown>;

    await writeFile(
      recordPath(),
      JSON.stringify({
        version: 2,
        checkout: record['checkout'],
        allChecksPassed: record['allChecksPassed'],
        inputs: ['package.json'],
        files: record['files'],
      }),
    );

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'recordWithoutOrigin' }]);
  });

  test('fails when the record names no shipped inputs', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as Record<string, unknown>;

    await writeFile(
      recordPath(),
      JSON.stringify({
        version: 2,
        checkout: record['checkout'],
        allChecksPassed: record['allChecksPassed'],
        files: record['files'],
      }),
    );

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
    await installFrom(checkout, { check: failingCheck });

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'installIncomplete' },
      { kind: 'checkFailed' },
      { kind: 'notInstalled', path: 'config/keys.json' },
      { kind: 'notInstalled', path: 'config/layouts/koja.json' },
      { kind: 'notInstalled', path: 'dist/mods/koja-tabs/icons/x.svg' },
      { kind: 'notInstalled', path: 'dist/mods/koja-tabs/main.js' },
    ]);
  });

  test('fails when a previous version 2 record claims success but not completion', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as Record<string, unknown>;

    await writeFile(
      recordPath(),
      JSON.stringify({
        version: 2,
        checkout: record['checkout'],
        allChecksPassed: true,
        inputs: record['inputs'],
        files: record['files'],
      }),
    );

    expect(await findIdentityFailures(options)).toEqual([{ kind: 'installIncomplete' }]);
  });

  test('names a sandbox command when the install is incomplete', async () => {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as Record<string, unknown>;

    await writeFile(
      recordPath(),
      JSON.stringify({
        version: 3,
        checkout: record['checkout'],
        allChecksPassed: true,
        completed: false,
        inputs: record['inputs'],
        files: record['files'],
      }),
    );

    const report = await identityReport(options);
    const line = report.lines.find((entry) => entry.includes('did not finish'));

    expect(report.exitCode).toBe(1);
    expect(line).toContain('bun run sandbox install');
    expect(line).toContain('bun run sandbox up');
    expect(line).not.toContain('herdr:install');
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

  test.each<[string, IdentityFailure[]]>([
    [
      'src/mods/koja-tabs/main.ts',
      [{ kind: 'changedSinceInstall', path: 'src/mods/koja-tabs/main.ts' }],
    ],
    ['src/kit/icons/x.svg', [{ kind: 'changedSinceInstall', path: 'src/kit/icons/x.svg' }]],
    [
      'config/layouts/koja.json',
      [
        { kind: 'differs', path: 'config/layouts/koja.json' },
        { kind: 'changedSinceInstall', path: 'config/layouts/koja.json' },
      ],
    ],
    ['scripts/build.ts', [{ kind: 'changedSinceInstall', path: 'scripts/build.ts' }]],
    ['scripts/install.ts', [{ kind: 'changedSinceInstall', path: 'scripts/install.ts' }]],
    ['scripts/checkoutLock.ts', [{ kind: 'changedSinceInstall', path: 'scripts/checkoutLock.ts' }]],
    ['package.json', [{ kind: 'changedSinceInstall', path: 'package.json' }]],
    ['bun.lock', [{ kind: 'changedSinceInstall', path: 'bun.lock' }]],
  ])('fails when %s changed after the install', async (path, expected) => {
    await rewriteAfterInstall(join(checkout, path));

    const failures = await findIdentityFailures(options);

    expect(failures).toEqual(expected);
  });

  test('passes when only the time of an input moved', async () => {
    await shiftTime(join(checkout, 'package.json'), -60_000);

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('passes when a shipped input was rewritten with the same content', async () => {
    const path = join(checkout, 'package.json');
    const content = await readFile(path);

    await writeFile(path, content);
    await shiftTime(path, 60_000);

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test.each([-3_600_000, 3_600_000])(
    'passes when only the time of the record file moved by %d milliseconds',
    async (milliseconds) => {
      await shiftTime(recordPath(), milliseconds);

      expect(await findIdentityFailures(options)).toEqual([]);
    },
  );

  test('fails when an input changed between the snapshot and the end of the install', async () => {
    const source = join(checkout, 'src', 'mods', 'koja-tabs', 'main.ts');

    // An hour in the past, so the edit below gets another time on any file system clock.
    await shiftTime(source, -3_600_000);

    const inputs = await shippedInputs(checkout);

    await install({
      home,
      checkout,
      inputs,
      modsDirectory: join(checkout, 'dist', 'mods'),
      configDirectory: join(checkout, 'config'),
      check: async () => {
        await writeFile(source, 'export default 2;\n');

        return { passed: true, output: 'passed' };
      },
    });

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'changedSinceInstall', path: 'src/mods/koja-tabs/main.ts' },
    ]);
  });

  test('passes when only a test file changed after the install', async () => {
    await rewriteAfterInstall(join(checkout, 'src', 'mods', 'koja-tabs', 'main.test.ts'));

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test.each([
    'src/mods/koja-tabs/main.ts',
    'src/kit/icons/x.svg',
    'config/layouts/koja.json',
    'config/keys.json',
    'bun.lock',
  ])('fails when %s was deleted after the install', async (path) => {
    await rm(join(checkout, path));

    const failures = await findIdentityFailures(options);

    expect(failures).toContainEqual({ kind: 'changedSinceInstall', path });
  });

  test('fails when a file was added under src after the install', async () => {
    await writeFile(join(checkout, 'src', 'kit', 'icons', 'plus.svg'), '<svg/>\n');

    expect(await findIdentityFailures(options)).toEqual([
      { kind: 'changedSinceInstall', path: 'src/kit/icons/plus.svg' },
    ]);
  });

  test('passes when a test file was added under src after the install', async () => {
    await writeFile(join(checkout, 'src', 'mods', 'koja-tabs', 'other.test.ts'), 'export {};\n');

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('passes when a test file under src was deleted after the install', async () => {
    await rm(join(checkout, 'src', 'mods', 'koja-tabs', 'main.test.ts'));

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('passes when a test file was edited in place after the install', async () => {
    await writeFile(join(checkout, 'src', 'mods', 'koja-tabs', 'main.test.ts'), 'export {};\n\n');

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('names a deleted input on its own line', async () => {
    await rm(join(checkout, 'src', 'kit', 'icons', 'x.svg'));

    const report = await identityReport(options);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toContain('src/kit/icons/x.svg');
  });

  test('passes when a shipped input file did not exist at the install', async () => {
    await rm(join(checkout, 'bun.lock'));
    await installFrom(checkout);

    expect(await findIdentityFailures(options)).toEqual([]);
  });

  test('reports every failed reason, each on its own line', async () => {
    await writeFile(join(checkout, 'dist', 'mods', 'koja-tabs', 'main.js'), 'export default 2;\n');
    await rewriteAfterInstall(join(checkout, 'package.json'));

    const report = await identityReport({ ...options, window: 'silent' });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toHaveLength(3);
    expect(report.lines.every((line) => !line.includes('\n'))).toBe(true);
    expect(report.lines[1]).toContain('dist/mods/koja-tabs/main.js');
    expect(report.lines[2]).toContain('package.json');
  });

  test('gives a missing record and an old record their own lines', async () => {
    await writeFile(recordPath(), JSON.stringify({ version: 1, files: [] }));

    const old = await identityReport(options);

    await rm(recordPath());

    const missing = await identityReport(options);
    const lines = [...old.lines, ...missing.lines];

    expect([old.exitCode, missing.exitCode]).toEqual([1, 1]);
    expect(lines).toHaveLength(2);
    expect(new Set(lines).size).toBe(2);
  });

  test.each([
    ['passes', async (): Promise<void> => undefined],
    [
      'fails',
      async (): Promise<void> => {
        await writeFile(join(home, 'keys.json'), '{ "edited": true }\n');
        await rewriteAfterInstall(join(checkout, 'package.json'));
      },
    ],
  ])('writes nothing when it %s', async (_, arrange) => {
    await arrange();

    const before = await snapshot(root);

    await identityReport(options);

    expect(await snapshot(root)).toEqual(before);
  });
});

describe('sandbox name holder', () => {
  test('names the checkout whose install holds the name', async () => {
    const other = join(root, 'other');

    await writeCheckout(other);
    await installFrom(other);

    const report = await nameHolderReport(options);

    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(other);
  });

  test('passes for the checkout whose install holds the name', async () => {
    expect(await nameHolderReport(options)).toEqual({ exitCode: 0, lines: [] });
  });

  test('passes when the sandbox has no install record', async () => {
    await rm(recordPath());

    expect((await nameHolderReport(options)).exitCode).toBe(0);
  });

  test('refuses when the install record cannot be read', async () => {
    await writeFile(recordPath(), 'not a record\n');

    const report = await nameHolderReport(options);

    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(recordPath());
  });

  test('passes when the checkout that holds the name is gone', async () => {
    const other = join(root, 'other');

    await writeCheckout(other);
    await installFrom(other);
    await rm(other, { recursive: true });

    expect((await nameHolderReport(options)).exitCode).toBe(0);
  });

  test('names the holder of a record from an older installer', async () => {
    const other = join(root, 'other');

    const record = {
      version: 1,
      checkout: other,
      allChecksPassed: true,
      inputs: [{ path: 'package.json', modifiedAt: 0 }],
      files: [],
    };

    await writeCheckout(other);
    await writeFile(recordPath(), JSON.stringify(record));

    const report = await nameHolderReport(options);

    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(other);
  });
});

const linesOf = (output: string): string[] => output.trim().split('\n');

describe('scripts/sandbox', () => {
  const script = resolve(import.meta.dir, '..', 'scripts', 'sandbox');
  const repository = resolve(import.meta.dir, '..');
  let name: string;
  let sandboxRoot: string;
  let fakes: string;
  let guards: string;
  let instrumentedSandbox: string;

  const pathWith = (...folders: string[]): string =>
    [...folders, guards, '/usr/bin', '/bin', Bun.env['PATH'] ?? ''].join(':');

  const environmentForSandbox = (environment: Record<string, string>): Record<string, string> => {
    const baseEnvironment = { ...Bun.env };

    delete baseEnvironment['RUTA_NAME'];
    delete baseEnvironment['TAU_VERIFICATION_RUN'];
    delete baseEnvironment['HERDR_APP_BIN'];

    return {
      ...baseEnvironment,
      ...environment,
      PATH: pathWith(fakes),
    };
  };

  const writeInstrumentedSandbox = async (): Promise<string> => {
    const path = join(fakes, 'scripts', 'sandbox');

    const source = replaceOnce(
      replaceOnce(
        await readFile(script, 'utf8'),
        'root=/var/tmp/ruta-$name',
        `root='${sandboxRoot}'`,
      ),
      'checkout=$(dirname "$here")',
      `checkout='${repository}'`,
    );

    await writeAt(path, source);
    await chmod(path, 0o755);

    return path;
  };

  const spawnSandbox = (command: string | undefined, environment: Record<string, string>) => {
    const argv = command === undefined ? [instrumentedSandbox] : [instrumentedSandbox, command];

    return Bun.spawn(argv, {
      env: environmentForSandbox(environment),
      stdout: 'pipe',
      stderr: 'pipe',
    });
  };

  const runSandbox = async (
    command: string | undefined,
    environment: Record<string, string>,
  ): Promise<{ exitCode: number; output: string; stdout: string; stderr: string }> => {
    const child = spawnSandbox(command, environment);

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { exitCode, output: stderr + stdout, stdout, stderr };
  };

  const runIdentity = async (
    environment?: Record<string, string>,
  ): Promise<{ exitCode: number; output: string }> =>
    runSandbox('identity', environment ?? { RUTA_NAME: name });

  const writeProgram = async (path: string, body: string): Promise<void> => {
    await writeAt(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
  };

  const writeWindow = async (exitCode: number): Promise<void> => {
    await writeProgram(join(sandboxRoot, 'bin', 'herdr-app'), `exit ${exitCode}`);
  };

  const writeRuta = async (line: string, exitCode: number): Promise<void> => {
    const record = `printf '%s %s %s\\n' "$RUTA_NAME" "$PWD" "$*" >>'${join(fakes, 'calls')}'`;
    const stream = exitCode === 0 ? '' : ' >&2';

    await writeProgram(join(fakes, 'ruta'), `${record}\necho '${line}'${stream}\nexit ${exitCode}`);
  };

  const installIntoSandbox = async (installedFrom: string): Promise<void> => {
    await installFrom(installedFrom, { home: join(sandboxRoot, 'config', 'herdr-app') });
  };

  const installOtherCheckout = async (): Promise<string> => {
    const other = join(root, 'other-checkout');

    await writeCheckout(other);
    await installIntoSandbox(other);

    return other;
  };

  beforeEach(async () => {
    name = `koja-identity-test-${randomBytes(6).toString('hex')}`;
    sandboxRoot = await mkdtemp(join(tmpdir(), 'koja-identity-root-'));
    fakes = await mkdtemp(join(tmpdir(), 'koja-identity-fakes-'));
    guards = await mkdtemp(join(tmpdir(), 'koja-identity-guards-'));
    instrumentedSandbox = await writeInstrumentedSandbox();

    for (const command of ['systemctl', 'systemd-run', 'ruta', 'herdr-app', 'hc']) {
      await writeProgram(join(guards, command), 'exit 127');
    }
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
    await rm(`${sandboxRoot}-capture`, { recursive: true, force: true });
    await rm(fakes, { recursive: true, force: true });
    await rm(guards, { recursive: true, force: true });
  });

  test('resolves the sandbox commands only inside the test folders', async () => {
    const child = Bun.spawn(
      [
        'sh',
        '-c',
        'for command in systemctl systemd-run ruta herdr-app hc; do command -v "$command"; done',
      ],
      { env: environmentForSandbox({}), stdout: 'pipe', stderr: 'pipe' },
    );

    const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    const paths = linesOf(output);

    expect(exitCode).toBe(0);
    expect(paths).toHaveLength(5);
    expect(paths.every((path) => path.startsWith(`${guards}/`))).toBe(true);
  });

  test('exits 1 with only the line of ruta when ruta status fails', async () => {
    await writeRuta('ruta is not up', 1);
    await writeWindow(0);

    const result = await runIdentity();

    expect(result.exitCode).toBe(1);
    expect(linesOf(result.output)).toEqual(['ruta is not up']);
  });

  test('asks ruta for the status once, from the checkout', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    await runIdentity();

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} status\n`);
  });

  test('names the sandbox after the verification run', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    const result = await runIdentity({ TAU_VERIFICATION_RUN: 'abc123' });

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toContain('koja-abc123');
    expect(result.output).toContain(join(sandboxRoot, 'config', 'herdr-app'));
    expect(result.output).not.toContain('/var/tmp/ruta-');
  });

  test('lowercases the run name', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    await runIdentity({ TAU_VERIFICATION_RUN: 'sandbox-oIr3hd' });

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toContain('koja-sandbox-oir3hd');
  });

  test('prefers the verification run over RUTA_NAME', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    await runIdentity({ RUTA_NAME: 'other', TAU_VERIFICATION_RUN: 'abc123' });

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toContain('koja-abc123');
  });

  test('passes the run name to ruta up', async () => {
    const program = join(fakes, 'herdr-app-fake');

    await writeProgram(program, 'exit 0');
    await writeRuta('ruta is up', 0);

    await runSandbox('up', { TAU_VERIFICATION_RUN: 'abc123', HERDR_APP_BIN: program });

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(
      `koja-abc123 ${repository} up -- ${program}\n`,
    );
  });

  test('reports a silent window and a missing record after the line of ruta', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(1);

    const silent = await runIdentity();

    await writeWindow(0);

    const answering = await runIdentity();
    const [status, record, ...rest] = linesOf(answering.output);

    expect(silent.exitCode).toBe(1);
    expect(linesOf(silent.output)).toHaveLength(3);
    expect(answering.exitCode).toBe(1);
    expect(status).toBe('ruta is up');
    expect(rest).toEqual([]);
    expect(linesOf(silent.output)[2]).toBe(record);
    expect(record).toContain(join(sandboxRoot, 'config', 'herdr-app'));
  });

  test('reports a silent window when ruta says up and the sandbox has no window program', async () => {
    await writeRuta('ruta is up', 0);

    const result = await runIdentity();

    expect(result.exitCode).toBe(1);
    expect(linesOf(result.output)).toHaveLength(3);
  });

  test('creates nothing in the sandbox folder', async () => {
    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    const before = await snapshot(sandboxRoot);

    await runIdentity();

    expect(await snapshot(sandboxRoot)).toEqual(before);
  });

  test.each(['down', 'restart', 'up'])(
    'refuses to %s a sandbox that another checkout holds',
    async (command) => {
      const program = join(fakes, 'herdr-app-fake');
      const other = await installOtherCheckout();

      await writeAt(join(sandboxRoot, 'machine', 'ownership.json'), '{}\n');
      await writeProgram(program, 'exit 0');
      await writeRuta('ruta is up', 0);

      const before = await snapshot(sandboxRoot);
      const result = await runSandbox(command, { RUTA_NAME: name, HERDR_APP_BIN: program });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(other);
      expect(result.stdout).toBe('');
      expect(await snapshot(sandboxRoot)).toEqual(before);
      expect(await Bun.file(join(fakes, 'calls')).exists()).toBe(false);
    },
  );

  test.each([
    ['up', 32, 0],
    ['up', 33, 2],
    ['capture', 24, 0],
    ['capture', 25, 2],
  ])('takes %s with a %i character name as exit %i', async (command, length, exitCode) => {
    const program = join(fakes, 'herdr-app-fake');
    const given = 'a'.repeat(length);

    await writeProgram(program, 'exit 0');
    await writeRuta('ruta is up', 0);

    const result = await runSandbox(command, { RUTA_NAME: given, HERDR_APP_BIN: program });

    expect(result.exitCode).toBe(exitCode);

    if (exitCode === 0) {
      const call = await readFile(join(fakes, 'calls'), 'utf8');

      expect(call).toContain(`${given} ${repository} ${command}`);
    } else {
      expect(result.stderr).toContain(given);
      expect(await Bun.file(join(fakes, 'calls')).exists()).toBe(false);
    }
  });

  test('refuses a name with a character ruta does not take', async () => {
    const result = await runSandbox('up', { RUTA_NAME: 'koja_bad' });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('koja_bad');
    expect(await Bun.file(join(fakes, 'calls')).exists()).toBe(false);
  });

  test('prints the rules for a bare call instead of refusing', async () => {
    const other = await installOtherCheckout();

    await writeRuta('ruta is up', 0);

    const result = await runSandbox(undefined, { RUTA_NAME: name });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain(other);
    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} \n`);
  });

  test('refuses to capture a capture sandbox that another checkout holds', async () => {
    const program = join(fakes, 'herdr-app-fake');
    const other = join(root, 'other-checkout');

    await writeCheckout(other);
    await installFrom(other, { home: join(`${sandboxRoot}-capture`, 'config', 'herdr-app') });
    await writeProgram(program, 'exit 0');
    await writeRuta('ruta is up', 0);

    const result = await runSandbox('capture', { RUTA_NAME: 'capture', HERDR_APP_BIN: program });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(other);
    expect(await Bun.file(join(fakes, 'calls')).exists()).toBe(false);
  });

  test('captures while another checkout holds the base name', async () => {
    await installOtherCheckout();
    await writeRuta('ruta is up', 0);

    const result = await runSandbox('capture', { RUTA_NAME: 'capture' });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`capture ${repository} capture\n`);
  });

  test.each(['log', 'opened', 'shot'])('reads through %s without refusing', async (command) => {
    const other = await installOtherCheckout();

    await writeRuta('ruta is up', 0);

    const result = await runSandbox(command, { RUTA_NAME: name });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain(other);

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} ${command}\n`);
  });

  test('reads the window status without refusing', async () => {
    const other = await installOtherCheckout();

    await writeProgram(join(sandboxRoot, 'bin', 'herdr-app'), "echo 'window answers'");

    const result = await runSandbox('status', { RUTA_NAME: name });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('window answers');
    expect(result.output).not.toContain(other);
    expect(await Bun.file(join(fakes, 'calls')).exists()).toBe(false);
  });

  test('runs identity when ruta reports another starter instead of refusing', async () => {
    const other = await installOtherCheckout();

    await writeRuta(`ruta ${name} serves ${other}, not ${repository}`, 1);
    await writeWindow(0);

    const result = await runSandbox('identity', { RUTA_NAME: name });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(other);
    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} status\n`);
  });

  test('reports the holder from the record through identity instead of refusing', async () => {
    const other = await installOtherCheckout();

    await writeRuta('ruta is up', 0);
    await writeWindow(0);

    const result = await runSandbox('identity', { RUTA_NAME: name });

    expect(result.exitCode).toBe(1);
    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} status\n`);
    expect(result.output).toContain(other);
  });

  test('prints the rules through guide instead of refusing', async () => {
    await installOtherCheckout();
    await writeRuta('ruta is up', 0);

    const result = await runSandbox('guide', { RUTA_NAME: name });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(`${name} ${repository} guide\n`);
  });

  test('starts a sandbox that this checkout already holds', async () => {
    const program = join(fakes, 'herdr-app-fake');

    await installIntoSandbox(repository);
    await writeProgram(program, 'exit 0');
    await writeRuta('ruta is up', 0);

    const result = await runSandbox('up', { RUTA_NAME: name, HERDR_APP_BIN: program });

    expect(result.exitCode).toBe(0);

    expect(await readFile(join(fakes, 'calls'), 'utf8')).toBe(
      `${name} ${repository} up -- ${program}\n`,
    );
  });

  test('serializes the install of two sandboxes', async () => {
    const record = join(fakes, 'installs');

    const body = [
      'case "$1" in',
      '  *sandboxIdentity.ts) exit 0 ;;',
      'esac',
      `printf 'start\\n' >>'${record}'`,
      'sleep 0.3',
      `printf 'end\\n' >>'${record}'`,
    ].join('\n');

    await writeProgram(join(fakes, 'bun'), body);
    await writeProgram(join(sandboxRoot, 'bin', 'herdr-app'), 'exit 0');

    const children = [
      spawnSandbox('install', { RUTA_NAME: name }),
      spawnSandbox('install', { RUTA_NAME: name }),
    ];

    const exitCodes = await Promise.all(children.map((child) => child.exited));

    expect(exitCodes).toEqual([0, 0]);
    expect(linesOf(await readFile(record, 'utf8'))).toEqual(['start', 'end', 'start', 'end']);
  });
});
