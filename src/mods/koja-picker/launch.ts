import type { Context } from 'gpui-kit';
import { focused } from 'herdr';

import {
  chipLineHeight,
  closeOverlay,
  controlSize,
  footerLineHeight,
  modName,
  openAtTop,
  overlayId,
  overlaySize,
  spacing,
} from '../../kit/index.ts';
import type { PreviewSession, PreviewStart } from './previewLifecycle.ts';

// The header band covers the search line and the chip line, so both columns end their top band on
// one rule, as the scene draws them.
const headerHeight = controlSize.searchField + chipLineHeight;

const listBlock = (start: PreviewStart | null): Record<string, unknown> => {
  const preview =
    start === null
      ? {}
      : { preview: { folder: start.folder, state: start.statePath, viewer: start.address } };

  return {
    type: 'block',
    size: { px: overlaySize.pickerListWidth },
    content: { mod: modName, props: { part: 'list', ...preview } },
  };
};

const footerBlock = {
  type: 'block',
  size: { px: footerLineHeight },
  content: { mod: modName, props: { part: 'footer' } },
};

const previewColumn = (address: string): Record<string, unknown> => ({
  type: 'column',
  size: { weight: 1 },
  children: [
    {
      type: 'block',
      size: { px: headerHeight },
      content: { mod: modName, props: { part: 'preview-header' } },
    },
    {
      type: 'block',
      padding: overlaySize.pickerInset,
      content: { terminal: address },
    },
  ],
});

// The error and its Retry take a row of the whole card, so a narrow or zoomed window cannot clip
// them behind the list.
const errorRow = {
  type: 'block',
  size: { px: controlSize.button + spacing.large * 2 },
  content: { mod: modName, props: { part: 'preview-error' } },
};

const pickerLayout = (start: PreviewStart | null): Record<string, unknown> => {
  const row =
    start === null
      ? { type: 'row', children: [listBlock(null)] }
      : {
          type: 'row',
          divider: { width: spacing.hairline, color: 'border' },
          children: [listBlock(start), previewColumn(start.address)],
        };

  return {
    type: 'column',
    children: start === null ? [row, errorRow, footerBlock] : [row, footerBlock],
  };
};

const openPicker = (start: PreviewStart | null): void => {
  openAtTop(
    {
      width: overlaySize.pickerWidthShare,
      height: overlaySize.pickerHeightShare,
      layout: pickerLayout(start),
    },
    overlaySize.topOffset,
  );
};

// A preview that cannot start leaves Go to open on the error line, so Retry runs this again from
// the overlay it shows.
export const launch = (
  cx: Context,
  session: PreviewSession,
  rememberPane: (tab: string, pane: string) => void,
  onSettled: () => void,
): void => {
  const overlay = overlayId();
  const here = focused();

  if (here?.pane !== null && here?.pane !== undefined) {
    rememberPane(here.tab, here.pane);
  }

  cx.spawn(async (taskCx) => {
    try {
      const started = await session.open(null).catch(() => null);
      const watching = started === null ? false : await session.ready(taskCx);

      if (started === null || !watching) {
        session.close();
        openPicker(null);
        closeOverlay(overlay);

        return;
      }

      // The list that opens next takes ownership; the launcher's close must not kill it.
      session.handOff();
      openPicker(started);
      closeOverlay(overlay);
    } finally {
      onSettled();
    }
  });
};
