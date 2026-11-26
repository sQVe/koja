import type { Element } from 'gpui-kit';

import { listRow, popupSurface, spacing } from '../../kit/index.ts';
import { surfaceSample } from './sample.ts';

export const popupSurfaces = (): Element[] => {
  const surface = popupSurface('popup-surface-sample')
    .py(spacing.xsmall)
    .child(listRow({ size: 'large', inset: true, state: 'normal', label: 'Normal row' }))
    .child(listRow({ size: 'large', inset: true, state: 'selected', label: 'Selected row' }));

  return [surfaceSample('chrome', surface)];
};
