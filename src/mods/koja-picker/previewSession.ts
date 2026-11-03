import { appHome, exec, hc, home } from 'herdr';

import { modName } from '../../kit/modName.ts';
import type { PreviewHost } from './previewLifecycle.ts';
import { createPreviewSession as createSession, findPreviewAddress } from './previewLifecycle.ts';
import type { PreviewSession } from './previewQueue.ts';

// One wire format per serve lifetime; an older terminal is removed instead of reused.
const protocol = 'v3';

const host = (): PreviewHost => ({
  hc,
  exec,
  name: `${modName}-preview-${protocol}`,
  legacyNames: [`${modName}-preview-v2`, `${modName}-preview`],
  fifo: `${home()}/.cache/herdr-${modName}-${protocol}.fifo`,
  script: `${appHome()}/mods/${modName}/preview.sh`,
});

export const livePreviewAddress = (
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string | null> => findPreviewAddress({ ...host(), sleep });

export const createPreviewSession = (): PreviewSession => createSession(host());
