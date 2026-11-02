import type { PaneInfo, SpaceInfo } from 'herdr';

// Where a space is now: its first terminal's live folder, else where it was made.
export const spaceFolder = (space: SpaceInfo, paneList: readonly PaneInfo[]): string => {
  const tabIdentifiers = new Set(space.tabs.map((tab) => tab.id));

  const live = paneList.find(
    (pane) => tabIdentifiers.has(pane.tab) && pane.cwd !== null && pane.cwd !== '',
  );

  return live?.cwd ?? space.folder;
};
