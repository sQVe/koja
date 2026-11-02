import { appHome, exec, hc, home } from 'herdr';

import { modName } from '../../kit/modName.ts';
import type { PreviewHost } from './previewLifecycle.ts';
import { createPreviewSession as createSession, findPreviewAddress } from './previewLifecycle.ts';
import type { PreviewSession } from './previewQueue.ts';

const host = (): PreviewHost => ({
  hc,
  exec,
  name: `${modName}-preview`,
  fifo: `${home()}/.cache/herdr-${modName}.fifo`,
  script: `${appHome()}/mods/${modName}/preview.sh`,
});

export const livePreviewAddress = (): Promise<string | null> => findPreviewAddress(host());

export const createPreviewSession = (): PreviewSession => createSession(host());
