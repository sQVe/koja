import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawn } from 'bun';
import type { Subprocess } from 'bun';

import { replaceOnce } from './scriptCopy.ts';

const checkout = resolve(import.meta.dir, '..');
const script = join(checkout, 'scripts', 'sandbox-machine');
const sandbox = join(checkout, 'scripts', 'sandbox');
const userId = process.getuid?.() ?? 1000;

const cgroupFor = (service: string): string =>
  `/user.slice/user-${userId}.slice/user@${userId}.service/app.slice/${service}`;

const outsideCgroupFor = (service: string): string =>
  `/user.slice/user-${userId}.slice/user@${userId}.service/other.slice/${service}`;

let name: string;
let root: string;
let guards: string;
let machineScript: string;
let machine: string;
let fixture: string;
let stateFile: string;
let receiptFile: string;
let bootId: string;
let temporaryFolders: string[];
let children: Subprocess[];

const newTemporaryFolder = async (prefix: string): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), prefix));

  temporaryFolders.push(folder);

  return folder;
};

const pathWith = (...folders: string[]): string =>
  [...folders, guards, '/usr/bin', '/bin', Bun.env['PATH'] ?? ''].join(':');

const writeInstrumentedMachineScript = async (): Promise<string> => {
  const folder = await newTemporaryFolder('koja-machine-scripts-');
  const path = join(folder, 'sandbox-machine');

  const source = replaceOnce(
    await readFile(script, 'utf8'),
    'root=/var/tmp/ruta-$name',
    `root='${root}'`,
  );

  await writeFile(path, source, { mode: 0o755 });
  await chmod(path, 0o755);

  return path;
};

const writeProgram = async (path: string, body: string): Promise<void> => {
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  await chmod(path, 0o755);
};

const serviceName = (): string => `koja-fixture-${randomBytes(6).toString('hex')}.service`;

const launchId = 'c'.repeat(32);

const ownership = (service: string, overrides: Record<string, unknown> = {}) => ({
  version: 2,
  service,
  bootId,
  port: 23456,
  launchId,
  invocationId: 'a'.repeat(32),
  cgroup: cgroupFor(service),
  ...overrides,
});

const writeOwnership = async (state: Record<string, unknown>): Promise<void> => {
  await mkdir(machine, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
};

const receipt = (service: string, overrides: Record<string, unknown> = {}) => ({
  version: 1,
  launchId,
  invocationId: 'a'.repeat(32),
  cgroup: cgroupFor(service),
  ...overrides,
});

const writeReceipt = async (value: Record<string, unknown>): Promise<void> => {
  await mkdir(machine, { recursive: true });
  await writeFile(receiptFile, JSON.stringify(value), { mode: 0o600 });
};

const fixtureRecord = async (fileName: string): Promise<string> =>
  (
    await readFile(join(import.meta.dir, 'fixtures', 'sandbox-machine', fileName), 'utf8')
  ).replaceAll('@USER_ID@', String(userId));

const writeRawRecord = async (path: string, contents: string): Promise<void> => {
  await mkdir(machine, { recursive: true });
  await writeFile(path, contents, { mode: 0o600 });
};

const unitProperties = (service: string, overrides: Record<string, string> = {}) => ({
  LoadState: 'loaded',
  ActiveState: 'active',
  SubState: 'running',
  InvocationID: 'a'.repeat(32),
  ControlGroup: cgroupFor(service),
  MainPID: '1234',
  Transient: 'yes',
  Type: 'exec',
  ExitType: 'cgroup',
  KillMode: 'control-group',
  Restart: 'no',
  SendSIGKILL: 'yes',
  TimeoutStopUSec: '5s',
  ...overrides,
});

const writeUnit = async (
  folder: string,
  service: string,
  properties: Record<string, string>,
): Promise<void> => {
  await writeFile(join(folder, `${service}.json`), JSON.stringify(properties));
};

const writeFakeSystemctl = async (folder: string): Promise<void> => {
  await writeProgram(
    join(folder, 'systemctl'),
    `dir=\${FAKE_MANAGER_DIR:?}
command=$1
shift
if [ "$command" = "--user" ]; then
  command=$1
  shift
fi
case $command in
  show)
    unit=
    property=
    for argument in "$@"; do
      case $argument in
        --property=*) property=\${argument#--property=} ;;
        --value|--no-pager) ;;
        -*) ;;
        *) unit=$argument ;;
      esac
    done
    if [ -z "$unit" ]; then
      if [ "$property" = Version ]; then
        echo 262
      fi
      exit 0
    fi
    if [ "\${FAKE_SHOW_RESULT:-ok}" = fail ]; then
      exit 1
    fi
    if [ -f "$dir/$unit.json" ]; then
      jq -r --arg property "$property" '.[$property] // ""' "$dir/$unit.json"
    elif [ "$property" = LoadState ]; then
      echo not-found
    fi
    exit 0
    ;;
  list-jobs)
    if [ "\${FAKE_JOB_RESULT:-none}" = present ]; then
      printf '1 job start\\n'
    fi
    if [ "\${FAKE_JOB_RESULT:-none}" = fail ]; then
      exit 1
    fi
    exit 0
    ;;
  stop)
    unit=$1
    printf 'stop %s\\n' "$unit" >>"$dir/calls"
    if [ -n "\${FAKE_STOP_RECORD:-}" ]; then
      printf 'start\\n' >>"$FAKE_STOP_RECORD"
      sleep 0.3
      printf 'end\\n' >>"$FAKE_STOP_RECORD"
    fi
    if [ "\${FAKE_STOP_RESULT:-ok}" = fail ]; then
      exit 1
    fi
    if [ "\${FAKE_STOP_REPLACE:-0}" = 1 ]; then
      jq '.InvocationID = "b" * 32' "$dir/$unit.json" >"$dir/$unit.json.new"
      mv "$dir/$unit.json.new" "$dir/$unit.json"
    elif [ "\${FAKE_STOP_LEAVES_UNIT:-0}" != 1 ]; then
      rm -f "$dir/$unit.json"
    fi
    exit 0
    ;;
esac
exit 0
`,
  );
};

const cleanEnvironment = (): Record<string, string> => {
  const environment: Record<string, string> = {};

  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }

  delete environment['RUTA_NAME'];
  delete environment['TAU_VERIFICATION_RUN'];

  return environment;
};

const environmentFor = (overrides: Record<string, string> = {}): Record<string, string> => {
  const environment: Record<string, string> = {
    ...cleanEnvironment(),
    RUTA_NAME: name,
    PATH: pathWith(),
    ...overrides,
  };

  delete environment['TAU_VERIFICATION_RUN'];

  return environment;
};

const run = async (
  program: string[],
  environment: Record<string, string> = {},
): Promise<{ exitCode: number; output: string }> => {
  const child = spawn(program, {
    cwd: checkout,
    env: environmentFor(environment),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, output: stderr + stdout };
};

const runBash = (body: string, environment: Record<string, string> = {}) =>
  run(['bash', '-c', body], environment);

const runDown = (environment: Record<string, string> = {}) =>
  run(['bash', machineScript, 'down'], environment);

const writeInstrumentedSandboxScripts = async (): Promise<string> => {
  const folder = await newTemporaryFolder('koja-machine-scripts-');
  const scripts = join(folder, 'scripts');

  await mkdir(scripts, { recursive: true });

  const sandboxSource = replaceOnce(
    replaceOnce(await readFile(sandbox, 'utf8'), 'root=/var/tmp/ruta-$name', `root='${root}'`),
    'checkout=$(dirname "$here")',
    `checkout='${checkout}'`,
  );

  const machineSource = replaceOnce(
    await readFile(script, 'utf8'),
    'root=/var/tmp/ruta-$name',
    `root='${root}'`,
  );

  await writeFile(join(scripts, 'sandbox'), sandboxSource, { mode: 0o755 });
  await writeFile(join(scripts, 'sandbox-machine'), machineSource, { mode: 0o755 });
  await chmod(join(scripts, 'sandbox'), 0o755);
  await chmod(join(scripts, 'sandbox-machine'), 0o755);

  return join(scripts, 'sandbox');
};

const spawnShell = (command: string, environment: Record<string, string> = {}): Subprocess => {
  const child = spawn(['sh', '-c', command], {
    cwd: checkout,
    env: environmentFor({ PATH: pathWith(), ...environment }),
    stdout: 'ignore',
    stderr: 'ignore',
  });

  children.push(child);

  return child;
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

beforeEach(async () => {
  name = `koja-machine-test-${randomBytes(6).toString('hex')}`;
  temporaryFolders = [];
  root = await mkdtemp(join(tmpdir(), 'koja-machine-root-'));
  guards = await newTemporaryFolder('koja-machine-guards-');
  machineScript = await writeInstrumentedMachineScript();
  machine = join(root, 'machine');
  fixture = join(machine, 'home', 'remote-fixture');
  stateFile = join(machine, 'ownership.json');
  receiptFile = join(machine, 'launch-receipt.json');
  bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  children = [];

  for (const command of ['systemctl', 'systemd-run', 'ruta', 'herdr-app', 'hc']) {
    await writeProgram(join(guards, command), 'exit 127');
  }
});

afterEach(async () => {
  for (const child of children) {
    try {
      child.kill('SIGKILL');
      await child.exited;
    } catch {
      // The process already ended.
    }
  }

  await rm(root, { recursive: true, force: true });

  for (const folder of temporaryFolders) {
    await rm(folder, { recursive: true, force: true });
  }
});

describe('scripts/sandbox-machine test isolation', () => {
  test('resolves the fixture commands only inside the test folders', async () => {
    const result = await runBash(`
      set -euo pipefail
      for command in systemctl systemd-run ruta herdr-app hc; do
        path=$(command -v "$command")
        case $path in
          '${guards}'/*) ;;
          *) printf '%s=%s\\n' "$command" "$path"; exit 1 ;;
        esac
      done
    `);

    expect(result.exitCode).toBe(0);
  });

  test('ignores an inherited verification run and keeps the root in the temporary folder', async () => {
    const result = await runBash(
      `set -euo pipefail
source '${machineScript}'
printf '%s\\n%s\\n' "$name" "$root"`,
      { TAU_VERIFICATION_RUN: 'decoy-run' },
    );

    expect(result.output).toBe(`${name}\n${root}\n`);
  });
});

describe('scripts/sandbox-machine down ownership', () => {
  test('keeps a process that only names the fixture in an unrelated environment value', async () => {
    const child = spawnShell('while :; do sleep 1; done', { PWD: fixture });
    const pid = child.pid;

    await Bun.sleep(100);

    const down = await runDown();

    expect(down.exitCode).toBe(0);
    expect(alive(pid)).toBe(true);
  }, 30_000);

  test('keeps a process whose argument names the fixture folder', async () => {
    const named = spawn(
      [
        'sh',
        '-c',
        'while :; do sleep 1; done',
        'sh',
        `{"folder":"${fixture}","machine":"qa-remote"}`,
      ],
      {
        cwd: checkout,
        env: environmentFor({ PATH: pathWith() }),
        stdout: 'ignore',
        stderr: 'ignore',
      },
    );

    children.push(named);
    await Bun.sleep(100);

    const down = await runDown();

    expect(down.exitCode).toBe(0);
    expect(alive(named.pid)).toBe(true);
  }, 30_000);
});

describe('scripts/sandbox-machine capability', () => {
  test('fails the capability probe when its disposable service cannot start', async () => {
    const folder = await newTemporaryFolder('koja-machine-probe-fail-');

    await writeFakeSystemctl(folder);
    await writeProgram(join(folder, 'systemd-run'), 'exit 1');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        if check_capability; then exit 1; fi
      `,
      { FAKE_MANAGER_DIR: folder, PATH: pathWith(folder) },
    );

    expect(result.exitCode).toBe(0);
  });

  test('does not stop a probe service when its start fails', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeProgram(join(manager, 'systemd-run'), 'exit 1');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        if check_capability; then exit 1; fi
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager) },
    );

    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not start or stop a probe when its name is not absent', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);
    await writeProgram(join(manager, 'systemd-run'), 'touch "$STARTED"; exit 1');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        service_property() { echo loaded; }
        if check_capability; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not stop a probe when its verification mismatches', async () => {
    const stopped = join(await newTemporaryFolder('koja-machine-stopped-'), 'stopped');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        service_property() {
          case "$2" in
            LoadState) echo not-found ;;
            ControlGroup) echo /user.slice/user-1000.slice/user@1000.service/app.slice/koja-fixture-aaaaaaaaaaaa.service ;;
            Transient) echo yes ;;
            Type) echo exec ;;
            ExitType) echo cgroup ;;
            KillMode) echo control-group ;;
            Restart) echo no ;;
            SendSIGKILL) echo no ;;
            TimeoutStopUSec) echo 3s ;;
            InvocationID) echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
          esac
        }
        user_systemd_run() { return 0; }
        cgroup_procs() { echo 12345; }
        process_cgroup_path() {
          if [ "$1" = "$$" ]; then echo /caller; else echo /user.slice/user-1000.slice/user@1000.service/app.slice/koja-fixture-aaaaaaaaaaaa.service; fi
        }
        stop_verified_service() { touch "$STOPPED"; }
        if check_capability; then exit 1; fi
        [ ! -e "$STOPPED" ] || exit 1
      `,
      { STOPPED: stopped },
    );

    expect(result.exitCode).toBe(0);
  });

  test('starts no listener when the capability probe fails', async () => {
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 1; }
        start_service() { touch "$STARTED"; }
        start_sshd() { touch "$STARTED"; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        copy_core() { return 0; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });
});

describe('scripts/sandbox-machine ownership', () => {
  test('writes the intent before starting the service', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        copy_core() { return 0; }
        start_sshd() { return 0; }
        start_service() {
          [ -f "$state_file" ] || exit 1
          boot=$(cat /proc/sys/kernel/random/boot_id)
          jq -e --arg boot "$boot" '
            .version == 2 and
            (.service | length > 0) and
            .bootId == $boot and
            .port == 23456 and
            .invocationId == "" and
            .cgroup == ""
          ' "$state_file" >/dev/null || exit 1
          [ "$(stat -c %a "$state_file")" = 600 ] || exit 1
          touch "$STARTED"
        }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        up
        [ -e "$STARTED" ]
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('does not start a fixture service when its name is not absent', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);
    await writeProgram(join(manager, 'systemd-run'), 'touch "$STARTED"; exit 0');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        copy_core() { return 0; }
        start_sshd() { return 0; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        service_property() { echo loaded; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('refuses to start when the intent record cannot be written', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);
    await writeProgram(join(manager, 'jq'), 'exit 1');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        copy_core() { return 0; }
        start_service() { touch "$STARTED"; }
        start_sshd() { touch "$STARTED"; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('starts a new service after an intent-only partial setup', async () => {
    const oldService = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);
    await writeOwnership(ownership(oldService, { invocationId: '', cgroup: '' }));

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 34567; }
        copy_core() { return 0; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        start_service() {
          jq -e '.service != "${oldService}" and .port == 34567 and .invocationId == "" and .cgroup == ""' "$state_file" >/dev/null || exit 1
          touch "$STARTED"
        }
        up
        [ -e "$STARTED" ]
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('reuses the live invocation and port on repeated up', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');
    const invocation = 'a'.repeat(32);

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { port: 34567 }));

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { exit 1; }
        copy_core() { return 0; }
        start_service() { touch "$STARTED"; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        up
        [ ! -e "$STARTED" ] || exit 1
        jq -e '.service == "${service}" and .port == 34567 and .invocationId == "${invocation}"' "$state_file" >/dev/null
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('recovers an invocation that was not recorded after start when its receipt matches', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const invocation = 'b'.repeat(32);

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service, { InvocationID: invocation }));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { invocationId: invocation }));

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        read_and_verify_state
        jq -e '.invocationId == "${invocation}" and .cgroup == "${cgroupFor(service)}"' "$state_file" >/dev/null
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager) },
    );

    expect(result.exitCode).toBe(0);
  });

  test('does not adopt a live service from a pending record without a receipt', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps an invalid ownership record and stops nothing', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await mkdir(machine, { recursive: true });
    await writeFile(stateFile, '{ not json\n', { mode: 0o600 });

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps a half-record and stops nothing', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { cgroup: '' }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps an unsafe cgroup path and stops nothing', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeOwnership(ownership(service, { cgroup: `/user.slice/../../etc/${service}` }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps a record when the manager reports an unsafe cgroup', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);

    await writeUnit(
      manager,
      service,
      unitProperties(service, {
        ControlGroup: `/user.slice/../../etc/${service}`,
      }),
    );

    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not stop a service with unexpected stop properties', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service, { SendSIGKILL: 'no' }));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps the record when the manager read times out', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeProgram(join(manager, 'systemctl'), 'sleep 5\nexit 0');
    await writeOwnership(ownership(service));

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        manager_timeout=1
        down
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager) },
    );

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });

  test('refuses to stop a service whose invocation does not match', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service, { InvocationID: 'b'.repeat(32) }));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('stops only the verified service and removes the record after drain', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(false);
    expect(await readFile(join(manager, 'calls'), 'utf8')).toBe(`stop ${service}\n`);
  });

  test('keeps the record when the manager cannot be read', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      FAKE_SHOW_RESULT: 'fail',
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });

  test('keeps the record when the service stop fails', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      FAKE_STOP_RESULT: 'fail',
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });

  test('keeps the record when the cgroup remains populated', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const cgroupRoot = await newTemporaryFolder('koja-machine-cgroup-');
    const cgroup = cgroupFor(service);

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));
    await mkdir(join(cgroupRoot, cgroup), { recursive: true });
    await writeFile(join(cgroupRoot, cgroup, 'cgroup.events'), 'populated 1\n');

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        cgroup_root='${cgroupRoot}'
        down
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager) },
    );

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });

  test('removes the record when the service is absent and the cgroup is empty', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(false);
  });

  test('serializes two downs on the same fixture', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const record = join(manager, 'stops');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const environment = {
      FAKE_MANAGER_DIR: manager,
      FAKE_STOP_RECORD: record,
      FAKE_STOP_RESULT: 'fail',
      PATH: pathWith(manager),
    };

    const first = spawn(['bash', machineScript, 'down'], {
      cwd: checkout,
      env: environmentFor(environment),
      stdout: 'ignore',
      stderr: 'ignore',
    });

    const second = spawn(['bash', machineScript, 'down'], {
      cwd: checkout,
      env: environmentFor(environment),
      stdout: 'ignore',
      stderr: 'ignore',
    });

    const exitCodes = await Promise.all([first.exited, second.exited]);
    const lines = (await readFile(record, 'utf8')).trim().split('\n');

    expect(exitCodes).not.toEqual([0, 0]);
    expect(lines).toEqual(['start', 'end', 'start', 'end']);
  });

  test('runs down again after a completed down', async () => {
    const first = await runDown();
    const second = await runDown();

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
  });

  test('runs down when there is no fixture', async () => {
    const down = await runDown();

    expect(down.exitCode).toBe(0);
  });

  test('scripts/sandbox down keeps the record when the fixture stop fails', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const calls = join(manager, 'ruta-calls');
    const instrumentedSandbox = await writeInstrumentedSandboxScripts();

    await writeFakeSystemctl(manager);
    await writeProgram(join(manager, 'ruta'), `printf '%s\\n' "$*" >>'${calls}'`);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await run(['bash', instrumentedSandbox, 'down'], {
      FAKE_MANAGER_DIR: manager,
      FAKE_STOP_RESULT: 'fail',
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(calls).exists()).toBe(false);
  });
});

describe('scripts/sandbox-machine ownership record shape', () => {
  const invalidRecords = (service: string): [string, Record<string, unknown>][] => {
    const withoutLaunchId: Record<string, unknown> = { ...ownership(service) };
    delete withoutLaunchId['launchId'];
    const withoutCgroup: Record<string, unknown> = { ...ownership(service) };
    delete withoutCgroup['cgroup'];

    return [
      ['missing launch ID', withoutLaunchId],
      ['missing cgroup', withoutCgroup],
      ['null invocation', ownership(service, { invocationId: null })],
      ['null cgroup', ownership(service, { cgroup: null })],
      ['mixed pair', ownership(service, { invocationId: '', cgroup: cgroupFor(service) })],
      ['string port', ownership(service, { port: '23456' })],
      ['zero port', ownership(service, { port: 0 })],
    ];
  };

  const checkInvalidRecord = (label: string, record: Record<string, unknown>): void => {
    test(`keeps a record with a ${label} and stops nothing`, async () => {
      const service = record['service'] as string;
      const manager = await newTemporaryFolder('koja-machine-manager-');

      await writeFakeSystemctl(manager);
      await writeUnit(manager, service, unitProperties(service));
      await writeOwnership(record);

      const down = await runDown({
        FAKE_MANAGER_DIR: manager,
        PATH: pathWith(manager),
      });

      expect(down.exitCode).not.toBe(0);
      expect(await Bun.file(stateFile).exists()).toBe(true);
      expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
    });
  };

  for (const [label, record] of invalidRecords(serviceName())) {
    checkInvalidRecord(label, record);
  }
});

describe('scripts/sandbox-machine record formats', () => {
  test('reads the frozen current ownership and receipt records', async () => {
    await writeRawRecord(stateFile, await fixtureRecord('ownership-v2.json'));
    await writeRawRecord(receiptFile, await fixtureRecord('launch-receipt-v1.json'));

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        state_record_read
        receipt_record_read "$state_service" "$state_launch_id" yes
      `,
    );

    expect(result.exitCode).toBe(0);
  });

  test('writes the current ownership and receipt formats', async () => {
    const service = serviceName();

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        mkdir -p "$machine"
        write_state '${service}' '${bootId}' 23456 '${launchId}' '' ''
        jq -e 'keys == ["bootId","cgroup","invocationId","launchId","port","service","version"] and .version == 2 and .service == "${service}" and .invocationId == "" and .cgroup == ""' "$state_file" >/dev/null
        sshd_bin=/bin/true
        write_start_wrapper
        INVOCATION_ID='${'d'.repeat(32)}' '${machine}/start-fixture' '${launchId}'
        jq -e 'keys == ["cgroup","invocationId","launchId","version"] and .version == 1' "$receipt_file" >/dev/null
      `,
    );

    expect(result.exitCode).toBe(0);
  });
});

describe('scripts/sandbox-machine strict record parsing', () => {
  const malformedOwnershipRecords = (service: string): [string, string][] => [
    ['an unknown field', JSON.stringify({ ...ownership(service), extra: true })],
    ['a nonobject value', JSON.stringify([ownership(service)])],
    [
      'multiple JSON values',
      `${JSON.stringify(ownership(service))}\n${JSON.stringify(ownership(service))}`,
    ],
    [
      'a cgroup with a trailing newline',
      JSON.stringify(ownership(service, { cgroup: `${cgroupFor(service)}\n` })),
    ],
    [
      'an incomplete pair',
      JSON.stringify(ownership(service, { invocationId: '', cgroup: cgroupFor(service) })),
    ],
    ['a fractional port', JSON.stringify(ownership(service, { port: 23456.5 }))],
    [
      'an invalid launch encoding',
      JSON.stringify(ownership(service, { launchId: 'C'.repeat(32) })),
    ],
    [
      'a service with a trailing newline',
      JSON.stringify(ownership(service, { service: `${service}\n` })),
    ],
    [
      'a boot ID with a trailing newline',
      JSON.stringify(ownership(service, { bootId: `${bootId}\n` })),
    ],
    [
      'a launch ID with a trailing newline',
      JSON.stringify(ownership(service, { launchId: `${launchId}\n` })),
    ],
  ];

  const malformedReceiptRecords = (service: string): [string, string][] => [
    ['an unknown field', JSON.stringify({ ...receipt(service), extra: true })],
    ['a nonobject value', JSON.stringify([receipt(service)])],
    [
      'multiple JSON values',
      `${JSON.stringify(receipt(service))}\n${JSON.stringify(receipt(service))}`,
    ],
    [
      'a cgroup with a trailing newline',
      JSON.stringify(receipt(service, { cgroup: `${cgroupFor(service)}\n` })),
    ],
    ['an incomplete record', JSON.stringify({ version: 1, launchId })],
    ['a fractional version', JSON.stringify(receipt(service, { version: 1.5 }))],
    [
      'an invalid invocation encoding',
      JSON.stringify(receipt(service, { invocationId: 'A'.repeat(32) })),
    ],
    [
      'a launch ID with a trailing newline',
      JSON.stringify(receipt(service, { launchId: `${launchId}\n` })),
    ],
    [
      'an invocation ID with a trailing newline',
      JSON.stringify(receipt(service, { invocationId: `${'a'.repeat(32)}\n` })),
    ],
  ];

  const checkMalformedOwnership = (label: string, contents: string): void => {
    test(`rejects an ownership record with ${label}`, async () => {
      await writeRawRecord(stateFile, contents);

      const result = await runBash(
        `
          set -euo pipefail
          source '${machineScript}'
          if state_valid; then exit 1; fi
        `,
      );

      expect(result.exitCode).toBe(0);
    });
  };

  for (const [label, contents] of malformedOwnershipRecords(serviceName())) {
    checkMalformedOwnership(label, contents);
  }

  const receiptService = serviceName();

  const checkMalformedReceipt = (label: string, contents: string): void => {
    test(`rejects a receipt with ${label}`, async () => {
      await writeRawRecord(receiptFile, contents);

      const result = await runBash(
        `
          set -euo pipefail
          source '${machineScript}'
          if receipt_valid '${receiptService}' '${launchId}'; then exit 1; fi
        `,
      );

      expect(result.exitCode).toBe(0);
    });
  };

  for (const [label, contents] of malformedReceiptRecords(receiptService)) {
    checkMalformedReceipt(label, contents);
  }

  const checkLateReceipt = (
    label: string,
    makeCandidate: (service: string, invocation: string) => Record<string, unknown>,
  ): void => {
    test(`does not load a ${label} receipt that appears during a manager observation`, async () => {
      const service = serviceName();
      const invocation = 'a'.repeat(32);
      const candidate = makeCandidate(service, invocation);
      const manager = await newTemporaryFolder('koja-machine-manager-');
      const base = await newTemporaryFolder('koja-machine-systemctl-');

      const candidateFile = join(
        await newTemporaryFolder('koja-machine-candidate-'),
        'receipt.json',
      );

      const marker = join(await newTemporaryFolder('koja-machine-marker-'), 'created');

      await writeFakeSystemctl(base);
      await writeUnit(manager, service, unitProperties(service, { InvocationID: invocation }));
      await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
      await writeFile(candidateFile, JSON.stringify(candidate), { mode: 0o600 });

      await writeProgram(
        join(manager, 'systemctl'),
        `if [ ! -e '${marker}' ]; then
  : > '${marker}'
  cp '${candidateFile}' '${receiptFile}'
  chmod 600 '${receiptFile}'
fi
exec '${base}/systemctl' "$@"`,
      );

      const stateBefore = await readFile(stateFile, 'utf8');

      const down = await runDown({
        FAKE_MANAGER_DIR: manager,
        PATH: pathWith(manager),
      });

      expect(down.exitCode).not.toBe(0);
      expect(await Bun.file(marker).exists()).toBe(true);
      expect(await readFile(stateFile, 'utf8')).toBe(stateBefore);
      expect(await readFile(receiptFile, 'utf8')).toBe(JSON.stringify(candidate));
      expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
    });
  };

  checkLateReceipt('retired', (service, invocation) => ({
    launchId,
    invocationId: invocation,
    cgroup: cgroupFor(service),
  }));

  checkLateReceipt('malformed', (service, invocation) => ({
    version: 1,
    launchId,
    invocationId: invocation,
    cgroup: cgroupFor(service),
    extra: true,
  }));

  test('does not recover a pending record whose receipt cgroup ends with a newline', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { cgroup: `${cgroupFor(service)}\n` }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(receiptFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not stop a service whose ownership cgroup ends with a newline', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { cgroup: `${cgroupFor(service)}\n` }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });
});

describe('scripts/sandbox-machine record format refusals', () => {
  const refuseBothPaths = async (): Promise<void> => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');
    const stateBefore = await readFile(stateFile, 'utf8');
    const receiptBefore = await readFile(receiptFile, 'utf8');

    await writeFakeSystemctl(manager);

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(stateFile, 'utf8')).toBe(stateBefore);
    expect(await readFile(receiptFile, 'utf8')).toBe(receiptBefore);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);

    const up = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        copy_core() { return 0; }
        start_service() { touch "$STARTED"; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { return 0; }
        up
      `,
      { FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(up.exitCode).not.toBe(0);
    expect(await readFile(stateFile, 'utf8')).toBe(stateBefore);
    expect(await readFile(receiptFile, 'utf8')).toBe(receiptBefore);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
    expect(await Bun.file(started).exists()).toBe(false);
  };

  const refuseReceiptWithoutOwnership = (
    label: string,
    contents: Record<string, unknown>,
  ): void => {
    test(`refuses ${label} without an ownership record`, async () => {
      const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

      await writeReceipt(contents);
      const receiptBefore = await readFile(receiptFile, 'utf8');

      const down = await runDown();

      expect(down.exitCode).not.toBe(0);
      expect(await readFile(receiptFile, 'utf8')).toBe(receiptBefore);

      const up = await runBash(
        `
          set -euo pipefail
          source '${machineScript}'
          require_up() { return 0; }
          start_service() { touch "$STARTED"; }
          up
        `,
        { STARTED: started },
      );

      expect(up.exitCode).not.toBe(0);
      expect(await readFile(receiptFile, 'utf8')).toBe(receiptBefore);
      expect(await Bun.file(started).exists()).toBe(false);
    });
  };

  const receiptOnlyService = serviceName();
  const retiredReceipt: Record<string, unknown> = receipt(receiptOnlyService);
  delete retiredReceipt['version'];

  refuseReceiptWithoutOwnership('a retired launch receipt', retiredReceipt);

  refuseReceiptWithoutOwnership(
    'a newer launch receipt',
    receipt(receiptOnlyService, { version: 2 }),
  );

  refuseReceiptWithoutOwnership(
    'a malformed launch receipt',
    receipt(receiptOnlyService, { extra: true }),
  );

  test('refuses a retired ownership record on up and down', async () => {
    const service = serviceName();

    await writeOwnership(ownership(service, { version: 1, invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service));
    await refuseBothPaths();
  });

  test('refuses a newer ownership record on up and down', async () => {
    const service = serviceName();

    await writeOwnership(ownership(service, { version: 3, invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service));
    await refuseBothPaths();
  });

  test('refuses a malformed ownership record on up and down', async () => {
    const service = serviceName();

    await writeOwnership(ownership(service, { extra: true }));
    await writeReceipt(receipt(service));
    await refuseBothPaths();
  });

  test('refuses a retired launch receipt on up and down', async () => {
    const service = serviceName();
    const oldReceipt: Record<string, unknown> = receipt(service);
    delete oldReceipt['version'];

    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(oldReceipt);
    await refuseBothPaths();
  });

  test('refuses a newer launch receipt on up and down', async () => {
    const service = serviceName();

    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { version: 2 }));
    await refuseBothPaths();
  });

  test('refuses a malformed launch receipt on up and down', async () => {
    const service = serviceName();

    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { extra: true }));
    await refuseBothPaths();
  });
});

describe('scripts/sandbox-machine missing ownership', () => {
  test('up refuses to launch when setup artifacts remain without a record', async () => {
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await mkdir(machine, { recursive: true });
    await writeFile(join(machine, 'sshd_config'), 'Port 23456\n');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { touch "$STARTED"; return 0; }
        start_service() { touch "$STARTED"; return 0; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
        [ -f "$machine/sshd_config" ] || exit 1
      `,
      { STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('down leaves an empty setup directory alone', async () => {
    await mkdir(join(machine, 'home'), { recursive: true });
    await mkdir(join(machine, 'run'), { recursive: true });
    await mkdir(join(machine, 'bin'), { recursive: true });

    const down = await runDown();

    expect(down.exitCode).toBe(0);
  });

  test('down refuses a setup path that is not a directory', async () => {
    await writeFile(machine, 'not a directory');

    const down = await runDown();

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(machine, 'utf8')).toBe('not a directory');
  });

  test('down refuses to unregister or delete setup artifacts without a record', async () => {
    await mkdir(machine, { recursive: true });
    await writeFile(join(machine, 'sshd_config'), 'Port 23456\n');

    const down = await runDown();

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(join(machine, 'sshd_config')).exists()).toBe(true);
  });

  test('scripts/sandbox down keeps artifacts and does not stop the sandbox without a record', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const calls = join(manager, 'ruta-calls');
    const instrumentedSandbox = await writeInstrumentedSandboxScripts();

    await writeProgram(join(manager, 'ruta'), `printf '%s\\n' "$*" >>'${calls}'`);
    await mkdir(machine, { recursive: true });
    await writeFile(join(machine, 'sshd_config'), 'Port 23456\n');

    const down = await run(['bash', instrumentedSandbox, 'down'], {
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(join(machine, 'sshd_config')).exists()).toBe(true);
    expect(await Bun.file(calls).exists()).toBe(false);
  });

  test('up refuses a registered fixture without a record', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `if [ "$1" = machine ] && [ "$2" = ls ]; then
  printf '{"machines":[{"name":"qa-remote","state":"connected","temporary":false}]}\n'
fi`,
    );

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        check_capability() { touch "$STARTED"; }
        start_service() { touch "$STARTED"; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('down refuses a registered fixture without a record and does not unregister it', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const calls = join(manager, 'hc-calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `printf '%s\\n' "$*" >>'${calls}'
if [ "$1" = machine ] && [ "$2" = ls ]; then
  printf '{"machines":[{"name":"qa-remote","state":"connected","temporary":false}]}\\n'
fi`,
    );

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
      { PATH: pathWith(manager) },
    );

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(calls).exists()).toBe(true);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });
});

describe('scripts/sandbox-machine fixture registration shape', () => {
  test('up starts when the machine list is an empty envelope', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');
    const added = join(await newTemporaryFolder('koja-machine-added-'), 'added');

    await writeFakeSystemctl(manager);
    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');
    await writeProgram(join(root, 'bin', 'hc'), `printf '{"machines":[]}\\n'`);

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        copy_core() { return 0; }
        start_service() { touch "$STARTED"; }
        wait_for_ssh() { return 0; }
        make_fixture() { return 0; }
        add_machine() { touch "$ADDED"; }
        up
        [ -e "$STARTED" ] && [ -e "$ADDED" ]
      `,
      { ADDED: added, FAKE_MANAGER_DIR: manager, PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('up refuses a flat machine array without starting', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');
    await writeProgram(join(root, 'bin', 'hc'), `printf '[{"name":"other-machine"}]\\n'`);

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        check_capability() { touch "$STARTED"; }
        start_service() { touch "$STARTED"; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('down exits cleanly when the machine list is an empty envelope', async () => {
    const calls = join(await newTemporaryFolder('koja-machine-calls-'), 'calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `printf '%s\\n' "$*" >>'${calls}'
printf '{"machines":[]}\\n'`,
    );

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
    );

    expect(down.exitCode).toBe(0);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });

  test('down refuses a bare machine array without unregistering', async () => {
    const calls = join(await newTemporaryFolder('koja-machine-calls-'), 'calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `printf '%s\\n' "$*" >>'${calls}'
printf '[]\\n'`,
    );

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
    );

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });

  test('down refuses a machine list whose entries are not named objects', async () => {
    const calls = join(await newTemporaryFolder('koja-machine-calls-'), 'calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `printf '%s\\n' "$*" >>'${calls}'
printf '{"machines":[null,{"name":5}]}\\n'`,
    );

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
    );

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });

  test('down refuses an empty machine list without unregistering', async () => {
    const calls = join(await newTemporaryFolder('koja-machine-calls-'), 'calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');
    await writeProgram(join(root, 'bin', 'hc'), `printf '%s\\n' "$*" >>'${calls}'`);

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
    );

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });
});

describe('scripts/sandbox-machine launch receipt', () => {
  test('a pending record with a live unit and a receipt for another launch is a conflict', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { launchId: 'd'.repeat(32) }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('a pending record with a live unit and a receipt for another invocation is a conflict', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { invocationId: 'b'.repeat(32) }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('a pending record with an incomplete receipt and a live unit is a conflict', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt({ version: 1, launchId });

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('a pending record with an incomplete start job is a conflict', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));

    const down = await runDown({
      FAKE_JOB_RESULT: 'present',
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('cleans an abandoned pending record when no unit, job or cgroup remains', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(false);
    expect(await Bun.file(receiptFile).exists()).toBe(false);
  });

  test('up refuses a generated service name with an incomplete start job', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await writeFakeSystemctl(manager);

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        start_service() { touch "$STARTED"; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      {
        FAKE_JOB_RESULT: 'present',
        FAKE_MANAGER_DIR: manager,
        PATH: pathWith(manager),
        STARTED: started,
      },
    );

    expect(result.exitCode).toBe(0);
  });

  test('writes a one-shot launch receipt before execing sshd', async () => {
    const service = serviceName();
    const executed = join(await newTemporaryFolder('koja-machine-exec-'), 'executed');
    const fakeSshd = join(await newTemporaryFolder('koja-machine-sshd-'), 'sshd');

    await writeProgram(fakeSshd, `touch '${executed}'`);
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));

    const first = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sshd_bin='${fakeSshd}'
        write_start_wrapper
        INVOCATION_ID='${'d'.repeat(32)}' '${machine}/start-fixture' '${launchId}'
      `,
    );

    expect(first.exitCode).toBe(0);
    expect(await Bun.file(executed).exists()).toBe(true);

    const saved = JSON.parse(await readFile(receiptFile, 'utf8')) as Record<string, string>;
    expect(saved['launchId']).toBe(launchId);
    expect(saved['invocationId']).toBe('d'.repeat(32));
    expect(saved['cgroup']).toStartWith('/');

    const second = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sshd_bin='${fakeSshd}'
        write_start_wrapper
        INVOCATION_ID='${'e'.repeat(32)}' '${machine}/start-fixture' '${launchId}'
      `,
    );

    const secondSaved = JSON.parse(await readFile(receiptFile, 'utf8')) as Record<string, string>;
    expect(second.exitCode).not.toBe(0);
    expect(secondSaved['invocationId']).toBe('d'.repeat(32));
  });

  test('does not report success when a different invocation appears after stop', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      FAKE_STOP_REPLACE: '1',
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });
});

describe('scripts/sandbox-machine strict proof boundaries', () => {
  test('keeps a record whose cgroup is outside the user-manager subtree', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const cgroup = outsideCgroupFor(service);

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service, { ControlGroup: cgroup }));
    await writeOwnership(ownership(service, { cgroup }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not recover a pending record whose receipt cgroup is outside the subtree', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const cgroup = outsideCgroupFor(service);

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service, { cgroup }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('down refuses when artifact observation fails', async () => {
    await mkdir(machine, { recursive: true });

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        find() { return 1; }
        down
      `,
    );

    expect(down.exitCode).not.toBe(0);
  });

  test('up refuses when artifact observation fails', async () => {
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await mkdir(machine, { recursive: true });

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        find() { return 1; }
        require_up() { return 0; }
        check_capability() { touch "$STARTED"; }
        start_service() { touch "$STARTED"; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('down refuses a registration that is not valid JSON', async () => {
    const calls = join(await newTemporaryFolder('koja-machine-calls-'), 'calls');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');

    await writeProgram(
      join(root, 'bin', 'hc'),
      `printf '%s\\n' "$*" >>'${calls}'
printf "not-json\\n"`,
    );

    const down = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        down
      `,
    );

    expect(down.exitCode).not.toBe(0);
    expect(await readFile(calls, 'utf8')).not.toContain('machine rm');
  });

  test('up refuses a registration that is not valid JSON', async () => {
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');

    await mkdir(join(root, 'bin'), { recursive: true });
    await writeProgram(join(root, 'bin', 'herdr-app'), 'exit 0');
    await writeProgram(join(root, 'bin', 'hc'), 'printf "not-json\\n"');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sandbox() {
          if [ "$1" = hc ]; then
            shift
            PATH="$root/bin:$PATH" hc "$@"
          else
            return 1
          fi
        }
        require_up() { return 0; }
        check_capability() { touch "$STARTED"; }
        start_service() { touch "$STARTED"; }
        if up; then exit 1; fi
        [ ! -e "$STARTED" ] || exit 1
      `,
      { PATH: pathWith(manager), STARTED: started },
    );

    expect(result.exitCode).toBe(0);
  });

  test('refuses to publish a receipt over a directory before launching sshd', async () => {
    const service = serviceName();
    const executed = join(await newTemporaryFolder('koja-machine-exec-'), 'executed');
    const fakeSshd = join(await newTemporaryFolder('koja-machine-sshd-'), 'sshd');

    await writeProgram(fakeSshd, `touch '${executed}'`);
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await mkdir(receiptFile, { recursive: true });

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        sshd_bin='${fakeSshd}'
        write_start_wrapper
        INVOCATION_ID='${'d'.repeat(32)}' '${machine}/start-fixture' '${launchId}'
      `,
    );

    expect(result.exitCode).not.toBe(0);
    expect(await Bun.file(executed).exists()).toBe(false);
  });

  test('keeps a record whose state file is not owner-only', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));
    await chmod(stateFile, 0o644);

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps a record with an invalid boot ID', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { bootId: 'not-a-boot-id' }));

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps a matching record from another boot and stops nothing', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');
    const oldBoot = '00000000-0000-4000-8000-000000000000';
    const record = ownership(service, { bootId: oldBoot });

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(record);

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toEqual(record);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('keeps a pending record whose receipt is not owner-only', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service, { invocationId: '', cgroup: '' }));
    await writeReceipt(receipt(service));
    await chmod(receiptFile, 0o644);

    const down = await runDown({
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(manager, 'calls')).exists()).toBe(false);
  });

  test('does not report success when a start job remains after stop', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_JOB_RESULT: 'present',
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });

  test('does not report success when post-stop job observation fails', async () => {
    const service = serviceName();
    const manager = await newTemporaryFolder('koja-machine-manager-');

    await writeFakeSystemctl(manager);
    await writeUnit(manager, service, unitProperties(service));
    await writeOwnership(ownership(service));

    const down = await runDown({
      FAKE_JOB_RESULT: 'fail',
      FAKE_MANAGER_DIR: manager,
      PATH: pathWith(manager),
    });

    expect(down.exitCode).not.toBe(0);
    expect(await Bun.file(stateFile).exists()).toBe(true);
  });
});

describe('scripts/sandbox-machine unexpected app readiness success', () => {
  test('unwinds without waiting on the lock it already holds', async () => {
    const result = await runBash(`
      set -euo pipefail
      source '${machineScript}'
      lock_machine
      run_bounded() { return 0; }
      sandbox() {
        timeout 1 flock "$lock_file" true
      }
      set +e
      wait_for_app $(( $(now_ms) + 1000 ))
      status=$?
      set -e
      printf 'status=%s\\n' "$status"
      exit "$status"
    `);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('unwinding');
  });

  test('aborts an unguarded setup failure before later setup and cleanup', async () => {
    const started = join(await newTemporaryFolder('koja-machine-started-'), 'started');
    const later = join(await newTemporaryFolder('koja-machine-later-'), 'later');
    const cleanup = join(await newTemporaryFolder('koja-machine-cleanup-'), 'log');

    await mkdir(machine, { recursive: true });
    await writeFile(join(machine, 'host_key'), 'host');
    await writeFile(join(machine, 'client_key'), 'client');
    await writeFile(join(machine, 'client_key.pub'), 'public');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        require_up() { return 0; }
        fixture_has_artifacts() { return 1; }
        fixture_registered() { return 1; }
        check_capability() { return 0; }
        free_port() { echo 23456; }
        service_property() { echo not-found; }
        service_has_pending_job() { return 1; }
        write_state() { return 0; }
        write_sshd_config() { return 0; }
        write_login() { return 0; }
        write_ssh_config() { return 0; }
        install_client() { return 0; }
        copy_core() { return 7; }
        start_service() { touch "$STARTED"; }
        wait_for_ssh() { touch "$LATER"; }
        make_fixture() { touch "$LATER"; }
        add_machine() { touch "$LATER"; }
        sandbox() {
          if [ "$1" = down ]; then
            touch "$CLEANUP"
          fi
          return 0
        }
        run_up
      `,
      { CLEANUP: cleanup, LATER: later, STARTED: started },
    );

    expect(result.exitCode).toBe(7);
    expect(await Bun.file(started).exists()).toBe(false);
    expect(await Bun.file(later).exists()).toBe(false);
    expect(await Bun.file(cleanup).exists()).toBe(false);
  });

  test('cleans up once from the lock owner and reports failure', async () => {
    const cleanup = join(await newTemporaryFolder('koja-machine-cleanup-'), 'log');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        run_bounded() { return 0; }
        wait_for_core() { return 0; }
        check_machine_shell() { return 0; }
        up() { add_machine; }
        sandbox() {
          if [ "$1" = down ]; then
            if flock -n "$lock_file" true; then
              printf 'released\\n' >> "$CLEANUP"
            else
              printf 'held\\n' >> "$CLEANUP"
            fi
            return 0
          fi
          return 0
        }
        run_up
      `,
      { CLEANUP: cleanup },
    );

    expect(result.exitCode).toBe(2);
    expect(await readFile(cleanup, 'utf8')).toBe('released\n');
  });

  test('does not clean up on an ordinary app error', async () => {
    const cleanup = join(await newTemporaryFolder('koja-machine-cleanup-'), 'log');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        run_bounded() { printf 'some other app error'; return 1; }
        wait_for_core() { return 0; }
        check_machine_shell() { return 0; }
        up() { add_machine; }
        sandbox() {
          if [ "$1" = down ]; then
            touch "$CLEANUP"
          fi
          return 0
        }
        run_up
      `,
      { CLEANUP: cleanup },
    );

    expect(result.exitCode).toBe(1);
    expect(await Bun.file(cleanup).exists()).toBe(false);
  });

  test('does not clean up when up fails with status 2 for another reason', async () => {
    const cleanup = join(await newTemporaryFolder('koja-machine-cleanup-'), 'log');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        up() { return 2; }
        sandbox() {
          if [ "$1" = down ]; then
            touch "$CLEANUP"
          fi
          return 0
        }
        run_up
      `,
      { CLEANUP: cleanup },
    );

    expect(result.exitCode).toBe(2);
    expect(await Bun.file(cleanup).exists()).toBe(false);
  });

  test('keeps polling the connecting response without cleanup', async () => {
    const cleanup = join(await newTemporaryFolder('koja-machine-cleanup-'), 'log');

    const result = await runBash(
      `
        set -euo pipefail
        source '${machineScript}'
        run_bounded() { printf 'Herdr has no machine called qa-remote'; return 1; }
        up() { wait_for_app $(( $(now_ms) + 100 )); }
        sandbox() {
          if [ "$1" = down ]; then
            touch "$CLEANUP"
          fi
          return 0
        }
        run_up
      `,
      { CLEANUP: cleanup },
    );

    expect(result.exitCode).toBe(1);
    expect(await Bun.file(cleanup).exists()).toBe(false);
  });
});
