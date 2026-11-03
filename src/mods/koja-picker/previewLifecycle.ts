import { recordOf, stringOf } from '../../kit/fields.ts';
import { PreviewSession } from './previewQueue.ts';

export interface ExecResult {
  code: number;
  stdout: string;
}

export interface PreviewHost {
  hc: (args: string[]) => Promise<ExecResult>;
  exec: (command: string, args: string[]) => Promise<ExecResult>;
  name: string;
  legacyNames: string[];
  fifo: string;
  script: string;
}

export interface PreviewStartHost extends PreviewHost {
  sleep: (milliseconds: number) => Promise<void>;
}

const stateOf = (stdout: string): Record<string, unknown> => recordOf(JSON.parse(stdout));

const isPreviewServe = (value: unknown): boolean => {
  if (!Array.isArray(value)) {
    return false;
  }

  const args = value.filter((part): part is string => typeof part === 'string');

  return args.some((part, index) => part.endsWith('preview.sh') && args[index + 1] === 'serve');
};

const fifoPollMilliseconds = 50;

const fifoPollAttempts = 20;

const waitForFifo = async (host: PreviewStartHost): Promise<boolean> => {
  for (let attempt = 0; attempt < fifoPollAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- the FIFO is polled until it appears
    const probe = await host.exec('test', ['-p', host.fifo]).catch(() => null);

    if (probe?.code === 0) {
      return true;
    }

    if (attempt < fifoPollAttempts - 1) {
      // eslint-disable-next-line no-await-in-loop -- a poll waits before its next try
      await host.sleep(fifoPollMilliseconds);
    }
  }

  return false;
};

export const findPreviewAddress = async (host: PreviewStartHost): Promise<string | null> => {
  for (const legacy of host.legacyNames) {
    // A terminal from an older protocol cannot read the current wire format. Replace it only
    // when it is Koja's own preview server, never a user terminal that shares the name.
    // eslint-disable-next-line no-await-in-loop -- each legacy name is checked before the next
    const existing = await host.hc(['get', '--json', legacy]).catch(() => null);

    if (existing?.code !== 0) {
      continue;
    }

    const terminal = stateOf(existing.stdout);

    if (!isPreviewServe(terminal['argv'])) {
      continue;
    }

    if (terminal['state'] === 'live') {
      // eslint-disable-next-line no-await-in-loop -- the live server is killed before removal
      await host.hc(['kill', legacy]).catch(() => null);
    }

    // eslint-disable-next-line no-await-in-loop -- the legacy terminal is removed before the next
    await host.hc(['rm', legacy]).catch(() => null);
  }

  const found = await host.hc(['get', '--json', host.name]).catch(() => null);

  if (found?.code === 0) {
    const terminal = stateOf(found.stdout);

    if (terminal['state'] === 'live') {
      const address = stringOf(terminal['address']);

      return (await waitForFifo(host)) ? address : null;
    }

    await host.hc(['rm', host.name]).catch(() => null);
  }

  const started = await host.hc([
    'run',
    '--bg',
    '--json',
    '--no-parent',
    '--name',
    host.name,
    '--',
    host.script,
    'serve',
    host.fifo,
  ]);

  if (started.code !== 0) {
    return null;
  }

  const address = stringOf(stateOf(started.stdout)['address']);

  return (await waitForFifo(host)) ? address : null;
};

export const writePreview = async (
  host: PreviewHost,
  session: string,
  sequence: number,
  address: string | null,
): Promise<boolean> => {
  const result = await host
    .exec(host.script, ['show', host.fifo, session, String(sequence), address ?? '-'])
    .catch(() => null);

  return result?.code === 0;
};

export const createPreviewSession = (host: PreviewHost): PreviewSession =>
  new PreviewSession((session, sequence, address) =>
    writePreview(host, session, sequence, address),
  );
