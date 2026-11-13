import { openOverlay } from 'herdr';

import { overlaySize } from './size.ts';

export type WorktreeAction = 'new' | 'open' | 'remove';

export type GroveAction = 'new' | 'remove';

export const openGroveDialog = (action: GroveAction, space: string | null): void => {
  openOverlay({
    mod: 'koja-worktree',
    kind: 'dialog',
    frame: 'none',
    width: overlaySize.groveWidth,
    height: overlaySize.groveHeight,
    props: { action, space },
  });
};

export const openWorktreeDialog = (
  action: WorktreeAction,
  space: string | null,
  folder: string | null = null,
): void => {
  const listing = action === 'open';

  openOverlay({
    mod: 'worktree',
    kind: 'dialog',
    width: listing ? overlaySize.worktreeListWidth : overlaySize.worktreeFormWidth,
    height: listing ? overlaySize.worktreeListHeight : overlaySize.worktreeFormHeight,
    props: { space, action, ...(folder === null ? {} : { folder }) },
  });
};
