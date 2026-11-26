import { mock } from 'bun:test';

import { drawn } from './drawn.ts';
import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from './moduleFakes.ts';
import type { ModuleFake } from './moduleFakes.ts';

// The parts the gallery draws through the kit index, shared so both gallery tests fake the same set.
const galleryKitParts = [
  'actionBlock',
  'age',
  'button',
  'contentSection',
  'dialog',
  'documentLine',
  'factRows',
  'hoverCard',
  'icon',
  'iconNames',
  'itemHeader',
  'keycap',
  'listRow',
  'overlay/card',
  'overlay/heading',
  'overlay/lines',
  'overlay/row',
  'overlay/scrollThumb',
  'partNote',
  'popupSurface',
  'projectHeader',
  'roleBadge',
  'searchField',
  'sectionHeader',
  'segmentedChip',
  'size',
  'sourceLink',
  'spaceFooter',
  'splitButton',
  'stackProgress',
  'stateLine',
  'statusMark',
  'statusRow',
  'tab',
  'text',
  'textField',
  'textRole',
  'theme',
  'viewSwitch',
  'workIcon',
] as const;

export const mockGalleryModules = async (herdr: ModuleFake = {}): Promise<ModuleFake> => {
  await mock.module('gpui-base', () =>
    gpuiBaseFake({
      h_flex: () => drawn(),
      v_flex: () => drawn(),
      InputState: { new: () => chainable() },
    }),
  );

  await mock.module('gpui-kit', () =>
    gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
  );

  await mock.module('herdr', () => herdrFake(herdr));

  return realKitIndexFake(galleryKitParts);
};
