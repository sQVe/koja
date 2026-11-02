import { openOverlay } from 'herdr';

import { overlaySize } from './size.ts';

export type WorktreeAction = 'new' | 'open' | 'remove';

// Opens Herdr's worktree dialog for a space. Opening one lists the repository's checkouts, so it
// gets the larger dialog.
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
