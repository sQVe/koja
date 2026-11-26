import type { PaneInfo, SpaceInfo, Status, TabInfo } from 'herdr';

import { folderNameOf } from '../../data/fields.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { StatusRollup } from '../../kit/statusRollup.ts';
import { statusRank } from '../../kit/statusRollup.ts';
import { tabLabel, tabName, tabProgram, taskOfPane } from '../../kit/tabLabel.ts';
import { bestFieldMatch, fuzzyMatch } from './match.ts';
import type { SpaceFacts } from './spaceFacts.ts';
import type { StackReason } from './stackSearch.ts';
import { stackForSpace, stackMatchOf } from './stackSearch.ts';

export interface PickerData {
  spaces: SpaceInfo[];
  panes: PaneInfo[];
  terminals: unknown[];
  statuses: StatusRollup;
  stored: Facts | null;
  facts: Record<string, SpaceFacts>;
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
  reason: StackReason | null;
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
  exact: boolean;
  score: number;
  rows: PickerRow[];
}

interface SpaceMatch {
  exact: boolean;
  score: number;
  reason: StackReason | null;
}

const statusWords: Record<Status, string> = {
  blocked: 'needs you',
  done: 'finished',
  working: 'working',
  idle: 'idle',
};

const statusWord = (status: Status | null): string | null =>
  status === null ? null : statusWords[status];

export const paneLabel = (pane: PaneInfo): string =>
  pane.terminal === null ? pane.title : `${pane.program.name} · ${pane.title}`;

export const paneDetail = (pane: PaneInfo): string | null => {
  const place = [folderNameOf(pane.cwd), pane.branch ?? ''].filter(Boolean).join(' · ');

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
  terminalRecords: unknown[],
): { program: PaneInfo['program'] | undefined; label: string } => {
  const program = tabProgram(tab, paneList);

  return { program, label: tabLabel(tab, program, paneList, terminalRecords) };
};

const paneSearchFields = (pane: PaneInfo, data: PickerData): (string | null)[] => {
  if (pane.terminal === null) {
    return [pane.title];
  }

  return [
    pane.title,
    pane.program.name,
    folderNameOf(pane.cwd),
    pane.branch,
    taskOfPane(pane, data.terminals),
  ];
};

const tabSearchFields = (
  tab: TabInfo,
  status: Status | null,
  data: PickerData,
): (string | null)[] => [
  tabName(tab, tabProgram(tab, data.panes), data.panes, data.terminals),
  statusWord(status),
  ...data.panes
    .filter((pane) => pane.tab === tab.id)
    .flatMap((pane) => paneSearchFields(pane, data)),
];

const spaceOwnFields = (space: SpaceInfo, data: PickerData): (string | null)[] => [
  space.name,
  data.facts[space.id]?.project ?? null,
  folderNameOf(space.folder),
  space.machine,
  statusWord(data.statuses.spaces[space.id] ?? null),
];

const spaceSearchTabs = (space: SpaceInfo, data: PickerData): (string | null)[] =>
  space.tabs.flatMap((tab) => tabSearchFields(tab, data.statuses.tabs[tab.id] ?? null, data));

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
  data: PickerData,
): { pane: PaneInfo; score: number }[] => {
  const matches: { pane: PaneInfo; score: number }[] = [];

  for (const tab of space.tabs) {
    for (const pane of panesOf(tab, data.panes)) {
      const match = bestFieldMatch(query, paneSearchFields(pane, data));

      if (match !== null) {
        matches.push({ pane, score: match.score });
      }
    }
  }

  return matches.toSorted((first, second) => second.score - first.score);
};

const spaceRowPane = (
  query: string,
  statuses: Status[] | null,
  space: SpaceInfo,
  data: PickerData,
  shownPanes: PaneInfo[],
  ownMatch: ReturnType<typeof bestFieldMatch>,
): PaneInfo | null => {
  if (statuses !== null) {
    return shownPanes[0] ?? null;
  }

  if (query === '') {
    return null;
  }

  const matches = matchedPanes(query, space, data);
  const best = matches[0];
  const runnerUp = matches[1];

  if (best === undefined) {
    return null;
  }

  // Only a pane that uniquely beats the space and every other pane may move the target.
  if (runnerUp !== undefined && runnerUp.score >= best.score) {
    return null;
  }

  return ownMatch !== null && ownMatch.score >= best.score ? null : best.pane;
};

const statusMatchingTab = (
  space: SpaceInfo,
  statuses: Status[],
  data: PickerData,
): TabInfo | undefined =>
  space.tabs.find((tab) => matchesStatus(data.statuses.tabs[tab.id] ?? null, statuses));

const fieldScoreOf = (
  space: SpaceInfo,
  query: string,
  data: PickerData,
  ownMatch: ReturnType<typeof bestFieldMatch>,
): number => {
  const tabScore = bestFieldMatch(query, spaceSearchTabs(space, data))?.score ?? -Infinity;

  return Math.max(ownMatch?.score ?? -Infinity, tabScore);
};

const spaceScore = (
  space: SpaceInfo,
  query: string,
  data: PickerData,
  ownMatch: ReturnType<typeof bestFieldMatch>,
): SpaceMatch | null => {
  const fieldScore = fieldScoreOf(space, query, data, ownMatch);
  const stackMatch = stackMatchOf(query, stackForSpace(data.stored, space, data.panes));
  const nameScore = fuzzyMatch(query, space.name)?.score ?? 0;

  // An exact PR match is its own tier, so this score only orders matches within that tier.
  if (stackMatch?.tier === 'exact') {
    return { exact: true, score: nameScore, reason: stackMatch.reason };
  }

  const best = Math.max(fieldScore, stackMatch?.score ?? -Infinity);

  if (best === -Infinity) {
    return null;
  }

  const reason = stackMatch !== null && stackMatch.score > fieldScore ? stackMatch.reason : null;

  return { exact: false, score: best + nameScore, reason };
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

  const ownMatch = query === '' ? null : bestFieldMatch(query, spaceOwnFields(space, data));
  const filteredPane = spaceRowPane(query, statuses, space, data, shownPanes, ownMatch);
  const filteredTab = space.tabs.find((tab) => tab.id === filteredPane?.tab);
  const statusTab = statuses === null ? undefined : statusMatchingTab(space, statuses, data);

  const shownTab =
    filteredTab ?? statusTab ?? space.tabs.find((tab) => tab.active) ?? space.tabs[0];

  const scored =
    query === ''
      ? { exact: false, score: 0, reason: null }
      : spaceScore(space, query, data, ownMatch);

  if (scored === null) {
    return null;
  }

  const spaceRow: PickerRow = {
    kind: 'space',
    key: `space:${space.id}`,
    space,
    tab: shownTab,
    pane: filteredPane,
    reason: scored.reason,
  };

  const rows = [spaceRow, ...space.tabs.flatMap((tab) => tabChildRows(space, tab, statuses, data))];

  return { exact: scored.exact, score: scored.score, rows };
};

const compareGroups = (first: RowGroup, second: RowGroup): number => {
  if (first.exact !== second.exact) {
    return first.exact ? -1 : 1;
  }

  return second.score - first.score;
};

export const buildRows = (
  query: string,
  statuses: Status[] | null,
  data: PickerData,
): PickerRow[] => {
  const groups = recentOrder(data)
    .map((space) => spaceRows(space, query, statuses, data))
    .filter((group): group is RowGroup => group !== null);

  const ordered = query === '' ? groups : groups.toSorted(compareGroups);

  return ordered.flatMap((group) => group.rows);
};

export const statusCount = (
  statuses: Status[],
  spaceList: SpaceInfo[],
  rollup: StatusRollup,
): number =>
  spaceList.filter((space) => statusInList(rollup.spaces[space.id] ?? null, statuses)).length;
