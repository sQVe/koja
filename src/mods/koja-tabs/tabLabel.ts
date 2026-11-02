import type { PaneInfo, TabInfo } from 'herdr';

export const tabLabel = (tabInfo: TabInfo, program: PaneInfo['program'] | undefined): string => {
  const name = /^tb\d+$/.test(tabInfo.name) ? (program?.name ?? 'Terminal') : tabInfo.name;

  return tabInfo.zoomed ? `${name} Z` : name;
};

export const tabProgram = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
): PaneInfo['program'] | undefined => {
  const tabPanes = paneList.filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null);

  return (tabPanes.find((pane) => pane.program.agent) ?? tabPanes[0])?.program;
};
