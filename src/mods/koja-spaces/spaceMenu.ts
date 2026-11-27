import type { SpaceInfo } from 'herdr';
import { openOverlay } from 'herdr';

import { overlaySize } from '../../kit/index.ts';

export const openSpaceMenu = (space: SpaceInfo): void => {
  // A popup is as tall as its items; the height is only the most.
  openOverlay({
    mod: 'koja-menu',
    kind: 'popup',
    width: overlaySize.menuWidth,
    height: overlaySize.menuHeight,
    props: { tab: 'space', target: { id: space.id } },
  });
};
