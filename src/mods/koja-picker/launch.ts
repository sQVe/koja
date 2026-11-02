// Opening the picker: start (or reuse) the preview terminal, then swap the picker's own overlay
// for the split. Without a preview terminal, Herdr's own picker still gets you somewhere.

import type { AsyncContext } from 'gpui-kit';
import { focused, run } from 'herdr';

import {
  closeOverlay,
  modName,
  openAtTop,
  overlayId,
  overlaySize,
  spacing,
} from '../../kit/index.ts';
import { livePreviewAddress } from './previewSession.ts';

// Opens like the command palette and Zed's pickers: a popup near the top of the window that
// leaves the window undimmed.
const openPicker = (previewAddress: string): void => {
  openAtTop(
    {
      width: overlaySize.pickerWidthShare,
      height: overlaySize.pickerHeightShare,
      layout: {
        type: 'row',
        divider: { width: spacing.hairline, color: 'border' },
        children: [
          {
            type: 'block',
            size: { px: overlaySize.pickerListWidth },
            content: { mod: modName, props: { part: 'list' } },
          },
          {
            type: 'block',
            padding: overlaySize.pickerInset,
            content: { terminal: previewAddress },
          },
        ],
      },
    },
    overlaySize.topOffset,
  );
};

export const launch = (
  cx: AsyncContext,
  rememberPane: (tab: string, pane: string) => void,
): void => {
  const overlay = overlayId();
  const here = focused();

  if (here?.pane !== null && here?.pane !== undefined) {
    rememberPane(here.tab, here.pane);
  }

  cx.spawn(async () => {
    const previewAddress = await livePreviewAddress().catch(() => null);

    closeOverlay(overlay);

    if (previewAddress === null) {
      run('mod.open', { name: 'picker' });
    } else {
      openPicker(previewAddress);
    }
  });
};
