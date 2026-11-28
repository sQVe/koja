import { mock } from 'bun:test';

import type { DrawnElement } from './drawn.ts';
import { drawn, drawnTexts } from './drawn.ts';
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
  'factLine',
  'factRows',
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
  'stackCard',
  'stackProgress',
  'stateLine',
  'statusMark',
  'statusRow',
  'tab',
  'text',
  'textField',
  'textRole',
  'theme',
  'toast',
  'toast/toastLevel',
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
    gpuiKitFake({
      div: () => drawn(),
      image: (path: string) => drawn(path, 'image'),
      svg: (path: string) => drawn(path, 'svg'),
    }),
  );

  await mock.module('herdr', () => herdrFake(herdr));

  return realKitIndexFake(galleryKitParts);
};

export const sampleNamed = (parts: DrawnElement[], label: string): DrawnElement => {
  const found = parts.find((part) => drawnTexts(part).includes(label));

  if (found === undefined) {
    throw new Error(`The gallery has no sample named ${label}.`);
  }

  return found;
};
