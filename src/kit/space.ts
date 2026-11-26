import type { PaneInfo, SpaceInfo } from 'herdr';

// The last folder of a path, which names a space or a pane in a row.
export const folderName = (path: string | null): string =>
  (path ?? '').split('/').findLast((part) => part !== '') ?? '';

export const spaceFolder = (space: SpaceInfo, paneList: readonly PaneInfo[]): string => {
  const tabIdentifiers = new Set(space.tabs.map((tab) => tab.id));

  const live = paneList.find(
    (pane) => tabIdentifiers.has(pane.tab) && typeof pane.cwd === 'string' && pane.cwd !== '',
  );

  return live?.cwd ?? space.folder;
};
