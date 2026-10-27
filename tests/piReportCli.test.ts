import { expect, it, onTestFinished } from 'bun:test';
import { join } from 'node:path';

import { cliTestTimeoutMs, environmentFor, root, temporaryDirectory } from './cliHarness.ts';
import { pollUntil } from './paneHarness.ts';
import { report } from './piReportHarness.ts';

const validPass = 'a'.repeat(64);

const listenerAt = (socketPath: string) => {
  const connections = { count: 0 };

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      open: () => {
        connections.count += 1;
      },
      data: () => undefined,
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return connections;
};

const startReport = (
  directory: string,
  input: string,
  environment: Record<string, string | undefined>,
) =>
  Bun.spawn(['bun', join(root, 'src/index.ts'), 'pi', 'report'], {
    cwd: directory,
    env: environment,
    stdin: new TextEncoder().encode(input),
    stdout: 'pipe',
    stderr: 'pipe',
  });

const reportEnvironment = (directory: string, socketPath: string) => ({
  ...environmentFor(directory),
  KOJA_PANE_ID: 'pane-1',
  KOJA_REPORT_TOKEN: validPass,
  KOJA_SOCKET_PATH: socketPath,
});

it(
  'connects to the pane socket for a valid report',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'koja.sock');
    const connections = listenerAt(socketPath);

    const child = startReport(
      directory,
      JSON.stringify({ ...report, processId: 1 }),
      reportEnvironment(directory, socketPath),
    );

    onTestFinished(() => {
      child.kill();
    });

    const connected = await pollUntil(
      () => Promise.resolve(connections.count),
      (count) => count > 0,
    );

    expect(connected).toBe(1);
  },
  cliTestTimeoutMs,
);

it.each([
  ['invalid JSON', '{"processId":', {}, 'The report on stdin is not valid JSON.'],
  [
    'an oversized field',
    JSON.stringify({ ...report, processId: 1, piVersion: 'x'.repeat(65) }),
    {},
    'The report on stdin is not a valid pi report. piVersion:',
  ],
  [
    'a missing KOJA_REPORT_TOKEN',
    JSON.stringify({ ...report, processId: 1 }),
    { KOJA_REPORT_TOKEN: undefined },
    'KOJA_REPORT_TOKEN is not set. pi report runs only inside a Koja pane.',
  ],
])(
  'refuses %s before it connects',
  async (_name, input, overrides, message) => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'koja.sock');
    const connections = listenerAt(socketPath);

    const child = startReport(directory, input, {
      ...reportEnvironment(directory, socketPath),
      ...overrides,
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: '' });
    expect(stderr).toContain(message);
    expect(stderr).not.toContain(validPass);
    expect(connections.count).toBe(0);
  },
  cliTestTimeoutMs,
);
