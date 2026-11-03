import { appHome, exec, hc, readTextFile, run, writeTextFile } from 'herdr';

import { modName } from '../../kit/modName.ts';
import type { PreviewHost, PreviewStart } from './previewLifecycle.ts';
import { PreviewSession } from './previewLifecycle.ts';

const liveHost = (): PreviewHost => ({
  script: `${appHome()}/mods/${modName}/preview.sh`,
  hc,
  read: (path) => readTextFile(path),
  write: async (path, text, expected) => {
    await writeTextFile(path, text, expected);
  },
  newFolder: async () => {
    const made = await exec('mktemp', ['-d', '-t', 'koja-picker.XXXXXX']).catch(() => null);

    if (made?.code !== 0) {
      return null;
    }

    const path = made.stdout.trim();

    return path === '' ? null : path;
  },
  removeFolder: (path) => {
    void exec('rm', ['-rf', path]).catch(() => undefined);
  },
  kill: (terminal) => {
    run('terminal.kill', { terminal });
  },
});

export const createPreviewSession = (): PreviewSession => new PreviewSession(liveHost());

export const resumePreviewSession = (start: PreviewStart): PreviewSession =>
  new PreviewSession(liveHost(), start);
