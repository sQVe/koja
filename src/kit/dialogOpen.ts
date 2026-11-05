import { openOverlay } from 'herdr';

import type { ConfirmDialog, PromptDialog } from './dialogPayload.ts';
import { overlaySize } from './size.ts';

export const openConfirm = (dialog: ConfirmDialog): void => {
  openOverlay({
    mod: 'koja-confirm',
    kind: 'dialog',
    frame: 'none',
    width: overlaySize.confirmWidth,
    height: overlaySize.confirmHeight,
    props: { ...dialog },
  });
};

export const openPrompt = (dialog: PromptDialog): void => {
  openOverlay({
    mod: 'koja-prompt',
    kind: 'dialog',
    frame: 'none',
    width: overlaySize.promptWidth,
    height: overlaySize.promptHeight,
    props: { ...dialog },
  });
};
