// The preview terminal's process and FIFO lifecycle, with the app calls injected so it tests
// without Herdr.

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
  fifo: string;
  script: string;
}

const stateOf = (stdout: string): Record<string, unknown> => recordOf(JSON.parse(stdout));

// Finds the running preview terminal or starts one; null when it cannot start.
export const findPreviewAddress = async (host: PreviewHost): Promise<string | null> => {
  const found = await host.hc(['get', '--json', host.name]).catch(() => null);

  if (found?.code === 0) {
    const terminal = stateOf(found.stdout);

    if (terminal['state'] === 'live') {
      return stringOf(terminal['address']);
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

  return started.code === 0 ? stringOf(stateOf(started.stdout)['address']) : null;
};

// A failed write is not recorded as shown, so the next selection retries it.
export const writePreview = async (host: PreviewHost, address: string | null): Promise<boolean> => {
  const result = await host
    .exec(host.script, ['show', host.fifo, address ?? '-'])
    .catch(() => null);

  return result?.code === 0;
};

export const createPreviewSession = (host: PreviewHost): PreviewSession =>
  new PreviewSession((address) => writePreview(host, address));
