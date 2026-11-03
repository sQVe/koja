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
import type { PreviewSession } from './previewLifecycle.ts';

const openPicker = (previewAddress: string, previewState: string, previewFolder: string): void => {
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
            content: {
              mod: modName,
              props: {
                part: 'list',
                preview: { folder: previewFolder, state: previewState, viewer: previewAddress },
              },
            },
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
  session: PreviewSession,
  rememberPane: (tab: string, pane: string) => void,
): void => {
  const overlay = overlayId();
  const here = focused();

  if (here?.pane !== null && here?.pane !== undefined) {
    rememberPane(here.tab, here.pane);
  }

  cx.spawn(async () => {
    const started = await session.open(null).catch(() => null);

    if (started === null) {
      session.close();
      closeOverlay(overlay);
      run('mod.open', { name: 'picker' });

      return;
    }

    // The list that opens next takes ownership; the launcher's close must not kill it.
    session.handOff();
    openPicker(started.address, started.statePath, started.folder);
    closeOverlay(overlay);
  });
};
