import type { Element } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';
import { openOverlay } from 'herdr';

import { overlaySize } from '../../kit/index.ts';
import type { SpaceLinks } from './spaceLinks.ts';

export const openSpaceMenu = (space: SpaceInfo, links: SpaceLinks): void => {
  // A popup is as tall as its items; the height is only the most.
  openOverlay({
    mod: 'koja-menu',
    kind: 'popup',
    width: overlaySize.menuWidth,
    height: overlaySize.menuHeight,
    props: {
      tab: 'space',
      target: { id: space.id },
      ...(links.ticket === null ? {} : { ticket: links.ticket }),
      ...(links.pull === null ? {} : { pull: links.pull }),
      ...(links.branch === null ? {} : { branch: links.branch }),
    },
  });
};

export const bindSpaceMenu = (element: Element, space: SpaceInfo, links: SpaceLinks): void => {
  element.on_mouse_down('right', () => {
    openSpaceMenu(space, links);
  });
};
