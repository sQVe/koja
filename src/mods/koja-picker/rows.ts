import type { PaneInfo, SpaceInfo, Status, TabInfo } from 'herdr';

import type { StatusRollup } from '../../kit/statusRollup.ts';
import { statusRank } from '../../kit/statusRollup.ts';
import { tabLabel, tabProgram } from '../../kit/tabLabel.ts';
import type { Match } from './match.ts';
import { bestFieldMatch, fuzzyMatch } from './match.ts';

export interface PickerData {
  spaces: SpaceInfo[];
  panes: PaneInfo[];
  statuses: StatusRollup;
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

const statusWords: Record<Status, string> = {
  blocked: 'needs you',
  done: 'finished',
  working: 'working',
  idle: 'idle',
};

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

const tabPane = (tab: TabInfo, data: PickerData): PaneInfo | null => {
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

export const tabRowDisplay = (
  tab: TabInfo,
  paneList: PaneInfo[],
): { program: PaneInfo['program'] | undefined; label: string } => {
  const program = tabProgram(tab, paneList);

  return { program, label: tabLabel(tab, program) };
};

const paneSearchFields = (pane: PaneInfo): (string | null)[] => {
  if (pane.terminal === null) {
    return [pane.title];
  }

  return [pane.title, pane.program.name, folderName(pane.cwd), pane.branch];
};

const tabSearchFields = (
  tab: TabInfo,
  status: Status | null,
  paneList: PaneInfo[],
): (string | null)[] => [
  tab.named ? tab.name : null,
  statusWord(status),
  ...paneList.filter((pane) => pane.tab === tab.id).flatMap(paneSearchFields),
];

const spaceSearchFields = (space: SpaceInfo, data: PickerData): (string | null)[] => [
  space.name,
  space.branch,
  folderName(space.folder),
  space.machine,
  statusWord(data.statuses.spaces[space.id] ?? null),
  ...space.tabs.flatMap((tab) =>
    tabSearchFields(tab, data.statuses.tabs[tab.id] ?? null, data.panes),
  ),
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

const statusInList = (status: Status | null, statuses: Status[]): boolean =>
  status !== null && statuses.includes(status);

const matchesStatus = (status: Status | null, statuses: Status[] | null): boolean =>
  statuses === null || statusInList(status, statuses);

const tabChildRows = (
  space: SpaceInfo,
  tab: TabInfo,
  statuses: Status[] | null,
  data: PickerData,
): PickerRow[] => {
  const tabPanes = panesOf(tab, data.panes);
  const shownPanes = tabPanes.filter((pane) => inStatus(pane, statuses));
  const tabMatches = matchesStatus(data.statuses.tabs[tab.id] ?? null, statuses);

  if (statuses !== null && !tabMatches && shownPanes.length === 0) {
    return [];
  }

  const rows: PickerRow[] = [];

  if (space.tabs.length > 1 && tabMatches) {
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

const spaceOwnFields = (space: SpaceInfo, data: PickerData): (string | null)[] => [
  space.name,
  space.branch,
  folderName(space.folder),
  space.machine,
  statusWord(data.statuses.spaces[space.id] ?? null),
];

const spaceRowPane = (
  query: string,
  statuses: Status[] | null,
  space: SpaceInfo,
  data: PickerData,
  shownPanes: PaneInfo[],
): PaneInfo | null => {
  if (statuses !== null) {
    return shownPanes[0] ?? null;
  }

  if (query === '') {
    return null;
  }

  const own = bestFieldMatch(query, spaceOwnFields(space, data));
  const matches = matchedPanes(query, space, data.panes);
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
  data: PickerData,
): RowGroup | null => {
  if (!matchesStatus(data.statuses.spaces[space.id] ?? null, statuses)) {
    return null;
  }

  const shownPanes = space.tabs
    .flatMap((tab) => panesOf(tab, data.panes))
    .filter((pane) => inStatus(pane, statuses));

  const filteredPane = spaceRowPane(query, statuses, space, data, shownPanes);
  const filteredTab = space.tabs.find((tab) => tab.id === filteredPane?.tab);
  const shownTab = filteredTab ?? space.tabs.find((tab) => tab.active) ?? space.tabs[0];

  const spaceRow: PickerRow = {
    kind: 'space',
    key: `space:${space.id}`,
    space,
    tab: shownTab,
    pane: filteredPane,
  };

  const rows = [spaceRow, ...space.tabs.flatMap((tab) => tabChildRows(space, tab, statuses, data))];

  if (query === '') {
    return { score: 0, rows };
  }

  const spaceMatch = bestFieldMatch(query, spaceSearchFields(space, data));

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
    .map((space) => spaceRows(space, query, statuses, data))
    .filter((group): group is RowGroup => group !== null);

  const ordered =
    query === '' ? groups : groups.toSorted((first, second) => second.score - first.score);

  return ordered.flatMap((group) => group.rows);
};

export const statusCount = (
  statuses: Status[],
  spaceList: SpaceInfo[],
  rollup: StatusRollup,
): number =>
  spaceList.filter((space) => statusInList(rollup.spaces[space.id] ?? null, statuses)).length;
