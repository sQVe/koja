import type { Context } from 'gpui-kit';
import { focused } from 'herdr';

import {
  closeOverlay,
  controlSize,
  modName,
  openAtTop,
  overlayId,
  overlaySize,
  rowHeight,
  spacing,
} from '../../kit/index.ts';
import type { PreviewSession, PreviewStart } from './previewLifecycle.ts';

// The header band is as tall as the search line, so the picker's two columns start together.
const headerHeight = controlSize.searchField;

// As tall as the kit's footer line, so the line fills its block.
const footerHeight = rowHeight.large + spacing.xxsmall;

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
  size: { px: footerHeight },
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

// Without a viewer there is no terminal to show, so the column holds the error line and its Retry.
const errorColumn = {
  type: 'block',
  size: { weight: 1 },
  content: { mod: modName, props: { part: 'preview-error' } },
};

const pickerLayout = (start: PreviewStart | null): Record<string, unknown> => ({
  type: 'column',
  children: [
    {
      type: 'row',
      divider: { width: spacing.hairline, color: 'border' },
      children: [listBlock(start), start === null ? errorColumn : previewColumn(start.address)],
    },
    footerBlock,
  ],
});

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
      openPicker(null);
      closeOverlay(overlay);

      return;
    }

    // The list that opens next takes ownership; the launcher's close must not kill it.
    session.handOff();
    openPicker(started);
    closeOverlay(overlay);
  });
};
