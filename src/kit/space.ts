import type { PaneInfo, SpaceInfo } from 'herdr';

export const spaceFolder = (space: SpaceInfo, paneList: readonly PaneInfo[]): string => {
  const tabIdentifiers = new Set(space.tabs.map((tab) => tab.id));

  const live = paneList.find(
    (pane) => tabIdentifiers.has(pane.tab) && pane.cwd !== null && pane.cwd !== '',
  );

  return live?.cwd ?? space.folder;
};
