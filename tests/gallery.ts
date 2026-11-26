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
  'age',
  'button',
  'contentSection',
  'dialog',
  'factRows',
  'hoverCard',
  'icon',
  'iconNames',
  'itemHeader',
  'listRow',
  'partNote',
  'popupSurface',
  'projectHeader',
  'roleBadge',
  'searchField',
  'sectionHeader',
  'size',
  'sourceLink',
  'spaceFooter',
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
