import type { PaneInfo, SpaceInfo, Status, TabInfo } from 'herdr';

import type { Match } from './match.ts';
import { bestFieldMatch, fuzzyMatch } from './match.ts';

export interface PickerData {
  spaces: SpaceInfo[];
  panes: PaneInfo[];
  recent: string[];
  focus: Record<string, string>;
}

interface PickerRowBase {
  key: string;
  space: SpaceInfo;
}

interface SpacePickerRow extends PickerRowBase {
  kind: 'space';
  tab: TabInfo | undefined;
  pane: PaneInfo | null;
}

export interface TabPickerRow extends PickerRowBase {
  kind: 'tab';
  tab: TabInfo;
  pane: PaneInfo | null;
}

export interface PanePickerRow extends PickerRowBase {
  kind: 'pane';
  tab: TabInfo;
  pane: PaneInfo;
}

export type PickerRow = SpacePickerRow | TabPickerRow | PanePickerRow;

interface RowGroup {
  score: number;
  rows: PickerRow[];
}

const statusRanks: Record<Status, number> = { blocked: 4, done: 3, working: 2, idle: 1 };

const statusWords: Record<Status, string> = {
  blocked: 'needs you',
  done: 'finished',
  working: 'working',
  idle: 'idle',
};

const statusRank = (status: Status | null | undefined): number =>
  status === null || status === undefined ? 0 : statusRanks[status];

const statusWord = (status: Status | null): string | null =>
  status === null ? null : statusWords[status];

const folderName = (path: string | null): string =>
  (path ?? '').split('/').findLast((part) => part !== '') ?? '';

export const paneLabel = (pane: PaneInfo): string =>
  pane.terminal === null ? pane.title : `${pane.program.name} · ${pane.title}`;

export const paneDetail = (pane: PaneInfo): string | null => {
  const place = [folderName(pane.cwd), pane.branch ?? ''].filter(Boolean).join(' · ');

  return place === '' ? null : place;
};

const panesOf = (tab: TabInfo, paneList: PaneInfo[]): PaneInfo[] =>
  paneList.filter((pane) => pane.tab === tab.id);

const terminalPanes = (tab: TabInfo, paneList: PaneInfo[]): PaneInfo[] =>
  panesOf(tab, paneList).filter((pane) => pane.terminal !== null);

export const tabPane = (tab: TabInfo, data: PickerData): PaneInfo | null => {
  const tabPanes = panesOf(tab, data.panes);
  const focusedPane = tabPanes.find((pane) => pane.focused);

  if (focusedPane !== undefined) {
    return focusedPane;
  }

  const remembered = tabPanes.find((pane) => pane.pane === data.focus[tab.id]);

  if (remembered !== undefined) {
    return remembered;
  }

  return (
    tabPanes.toSorted((first, second) => statusRank(second.status) - statusRank(first.status))[0] ??
    null
  );
};

export const rowPane = (row: PickerRow | undefined, data: PickerData): PaneInfo | null => {
  if (row === undefined) {
    return null;
  }

  if (row.pane !== null) {
    return row.pane;
  }

  return row.tab === undefined ? null : tabPane(row.tab, data);
};

const tabName = (tab: TabInfo): string => (tab.named ? tab.name : `Tab ${tab.index}`);

export const tabLabel = (tab: TabInfo, paneList: PaneInfo[]): string => {
  const title = terminalPanes(tab, paneList)[0]?.title ?? '';

  return title === '' ? tabName(tab) : `${tabName(tab)} · ${title}`;
};

const paneSearchFields = (pane: PaneInfo): (string | null)[] => {
  if (pane.terminal === null) {
    return [pane.title];
  }

  return [pane.title, pane.program.name, folderName(pane.cwd), pane.branch];
};

const tabSearchFields = (tab: TabInfo, paneList: PaneInfo[]): (string | null)[] => [
  tab.named ? tab.name : null,
  statusWord(tab.status),
  ...paneList.filter((pane) => pane.tab === tab.id).flatMap(paneSearchFields),
];

const spaceSearchFields = (space: SpaceInfo, paneList: PaneInfo[]): (string | null)[] => [
  space.name,
  space.branch,
  folderName(space.folder),
  space.machine,
  statusWord(space.status),
  ...space.tabs.flatMap((tab) => tabSearchFields(tab, paneList)),
];

const recentOrder = (data: PickerData): SpaceInfo[] => {
  const position = (space: SpaceInfo): number => {
    const index = data.recent.indexOf(space.id);

    return index === -1 ? data.recent.length + space.index : index;
  };

  return data.spaces.toSorted((first, second) => position(first) - position(second));
};

const hasStatus = (pane: PaneInfo, statuses: Status[]): boolean =>
  pane.status !== null && statuses.includes(pane.status);

const inStatus = (pane: PaneInfo, statuses: Status[] | null): boolean =>
  statuses === null || hasStatus(pane, statuses);

const tabChildRows = (
  space: SpaceInfo,
  tab: TabInfo,
  statuses: Status[] | null,
  paneList: PaneInfo[],
): PickerRow[] => {
  const tabPanes = panesOf(tab, paneList);
  const shownPanes = tabPanes.filter((pane) => inStatus(pane, statuses));

  if (statuses !== null && shownPanes.length === 0) {
    return [];
  }

  const rows: PickerRow[] = [];

  if (space.tabs.length > 1) {
    const pane = statuses === null ? null : (shownPanes[0] ?? null);

    rows.push({ kind: 'tab', key: `tab:${tab.id}`, space, tab, pane });
  }

  if (tabPanes.length > 1) {
    rows.push(
      ...shownPanes.map((pane): PickerRow => ({
        kind: 'pane',
        key: `pane:${pane.pane}`,
        space,
        tab,
        pane,
      })),
    );
  }

  return rows;
};

const matchedPanes = (
  query: string,
  space: SpaceInfo,
  paneList: PaneInfo[],
): { pane: PaneInfo; score: number }[] => {
  const matches: { pane: PaneInfo; score: number }[] = [];

  for (const tab of space.tabs) {
    for (const pane of panesOf(tab, paneList)) {
      const match = bestFieldMatch(query, paneSearchFields(pane));

      if (match !== null) {
        matches.push({ pane, score: match.score });
      }
    }
  }

  return matches.toSorted((first, second) => second.score - first.score);
};

const spaceOwnFields = (space: SpaceInfo): (string | null)[] => [
  space.name,
  space.branch,
  folderName(space.folder),
  space.machine,
  statusWord(space.status),
];

const spaceRowPane = (
  query: string,
  statuses: Status[] | null,
  space: SpaceInfo,
  paneList: PaneInfo[],
  shownPanes: PaneInfo[],
): PaneInfo | null => {
  if (statuses !== null) {
    return shownPanes[0] ?? null;
  }

  if (query === '') {
    return null;
  }

  const own = bestFieldMatch(query, spaceOwnFields(space));
  const matches = matchedPanes(query, space, paneList);
  const best = matches[0];
  const runnerUp = matches[1];

  if (best === undefined) {
    return null;
  }

  // Only a pane that uniquely beats the space and every other pane may move the target.
  if (runnerUp !== undefined && runnerUp.score >= best.score) {
    return null;
  }

  return own !== null && own.score >= best.score ? null : best.pane;
};

const spaceRows = (
  space: SpaceInfo,
  query: string,
  statuses: Status[] | null,
  paneList: PaneInfo[],
): RowGroup | null => {
  const shownPanes = space.tabs
    .flatMap((tab) => panesOf(tab, paneList))
    .filter((pane) => inStatus(pane, statuses));

  if (statuses !== null && shownPanes.length === 0) {
    return null;
  }

  const filteredPane = spaceRowPane(query, statuses, space, paneList, shownPanes);
  const filteredTab = space.tabs.find((tab) => tab.id === filteredPane?.tab);
  const shownTab = filteredTab ?? space.tabs.find((tab) => tab.active) ?? space.tabs[0];

  const spaceRow: PickerRow = {
    kind: 'space',
    key: `space:${space.id}`,
    space,
    tab: shownTab,
    pane: filteredPane,
  };

  const rows = [
    spaceRow,
    ...space.tabs.flatMap((tab) => tabChildRows(space, tab, statuses, paneList)),
  ];

  if (query === '') {
    return { score: 0, rows };
  }

  const spaceMatch = bestFieldMatch(query, spaceSearchFields(space, paneList));

  if (spaceMatch === null) {
    return null;
  }

  const nameMatch: Match | null = fuzzyMatch(query, space.name);

  return { score: spaceMatch.score + (nameMatch?.score ?? 0), rows };
};

export const buildRows = (
  query: string,
  statuses: Status[] | null,
  data: PickerData,
): PickerRow[] => {
  const groups = recentOrder(data)
    .map((space) => spaceRows(space, query, statuses, data.panes))
    .filter((group): group is RowGroup => group !== null);

  const ordered =
    query === '' ? groups : groups.toSorted((first, second) => second.score - first.score);

  return ordered.flatMap((group) => group.rows);
};

export const statusCount = (statuses: Status[], paneList: PaneInfo[]): number =>
  paneList.filter((pane) => pane.terminal !== null && inStatus(pane, statuses)).length;
