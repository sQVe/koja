import type { PaneInfo, SpaceInfo, Status, TabInfo } from 'herdr';

import { folderNameOf } from '../../data/fields.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { StatusOwners, StatusRollup } from '../../kit/statusRollup.ts';
import { rollupOwners, statusRank } from '../../kit/statusRollup.ts';
import {
  tabLabel,
  tabNameWithTasks,
  tabProgram,
  taskIndexOf,
  taskOfPaneWithTasks,
} from '../../kit/tabLabel.ts';
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
  tabRowShown: boolean;
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

interface RowScope {
  query: string;
  tasks: ReadonlyMap<unknown, string>;
  statuses: Status[] | null;
  owners: StatusOwners | null;
  data: PickerData;
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

const hasStatus = (pane: PaneInfo, statuses: Status[]): boolean =>
  pane.status !== null && statuses.includes(pane.status);

const inStatus = (pane: PaneInfo, statuses: Status[] | null): boolean =>
  statuses === null || hasStatus(pane, statuses);

const statusInList = (status: Status | null, statuses: Status[]): boolean =>
  status !== null && statuses.includes(status);

const matchesStatus = (status: Status | null, statuses: Status[] | null): boolean =>
  statuses === null || statusInList(status, statuses);

const paneSearchFields = (
  pane: PaneInfo,
  tasks: ReadonlyMap<unknown, string>,
): (string | null)[] => {
  if (pane.terminal === null) {
    return [pane.title];
  }

  return [
    pane.title,
    pane.program.name,
    folderNameOf(pane.cwd),
    pane.branch,
    taskOfPaneWithTasks(pane, tasks),
  ];
};

const explicitTabName = (tab: TabInfo, program: PaneInfo['program'] | undefined): string | null =>
  tab.named && tab.name !== program?.name ? tab.name : null;

const tabSearchFields = (
  tab: TabInfo,
  status: Status | null,
  scope: RowScope,
): (string | null)[] => {
  const tabPanes = panesOf(tab, scope.data.panes);
  const statuses = scope.statuses;

  if (statuses === null) {
    return [
      tabNameWithTasks(tab, tabProgram(tab, tabPanes), tabPanes, scope.tasks),
      statusWord(status),
      ...tabPanes.flatMap((pane) => paneSearchFields(pane, scope.tasks)),
    ];
  }

  const tabMatches = matchesStatus(status, statuses);
  const eligiblePanes = tabPanes.filter((pane) => inStatus(pane, statuses));
  const fields: (string | null)[] = [];

  if (tabMatches) {
    fields.push(explicitTabName(tab, tabProgram(tab, tabPanes)));
  }

  if (eligiblePanes.length > 0) {
    const unnamedTab = { ...tab, named: false };
    const eligibleProgram = tabProgram(tab, eligiblePanes);

    fields.push(tabNameWithTasks(unnamedTab, eligibleProgram, eligiblePanes, scope.tasks));
  }

  if (tabMatches) {
    fields.push(statusWord(status));
  }

  fields.push(...eligiblePanes.flatMap((pane) => paneSearchFields(pane, scope.tasks)));

  return fields;
};

const spaceOwnFields = (space: SpaceInfo, data: PickerData): (string | null)[] => [
  space.name,
  data.facts[space.id]?.project ?? null,
  folderNameOf(space.folder),
  space.machine,
  statusWord(data.statuses.spaces[space.id] ?? null),
];

const spaceSearchTabs = (space: SpaceInfo, scope: RowScope): (string | null)[] =>
  space.tabs.flatMap((tab) =>
    tabSearchFields(tab, scope.data.statuses.tabs[tab.id] ?? null, scope),
  );

const recentOrder = (data: PickerData): SpaceInfo[] => {
  const position = (space: SpaceInfo): number => {
    const index = data.recent.indexOf(space.id);

    return index === -1 ? data.recent.length + space.index : index;
  };

  return data.spaces.toSorted((first, second) => position(first) - position(second));
};

const tabChildRows = (space: SpaceInfo, tab: TabInfo, scope: RowScope): PickerRow[] => {
  const tabPanes = panesOf(tab, scope.data.panes);
  const shownPanes = tabPanes.filter((pane) => inStatus(pane, scope.statuses));
  const tabMatches = matchesStatus(scope.data.statuses.tabs[tab.id] ?? null, scope.statuses);

  if (scope.statuses !== null && !tabMatches && shownPanes.length === 0) {
    return [];
  }

  const rows: PickerRow[] = [];
  const tabRowShown = space.tabs.length > 1 && tabMatches;

  if (tabRowShown) {
    const pane =
      scope.statuses === null ? null : (shownPanes[0] ?? scope.owners?.tabs[tab.id] ?? null);

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
        tabRowShown,
      })),
    );
  }

  return rows;
};

const matchedPanes = (space: SpaceInfo, scope: RowScope): { pane: PaneInfo; score: number }[] => {
  const matches: { pane: PaneInfo; score: number }[] = [];

  for (const tab of space.tabs) {
    for (const pane of panesOf(tab, scope.data.panes)) {
      if (!inStatus(pane, scope.statuses)) {
        continue;
      }

      const match = bestFieldMatch(scope.query, paneSearchFields(pane, scope.tasks));

      if (match !== null) {
        matches.push({ pane, score: match.score });
      }
    }
  }

  return matches.toSorted((first, second) => second.score - first.score);
};

const uniquePaneMatch = (
  space: SpaceInfo,
  scope: RowScope,
  ownMatch: ReturnType<typeof bestFieldMatch>,
): PaneInfo | null => {
  if (scope.query === '') {
    return null;
  }

  const matches = matchedPanes(space, scope);
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
  scope: RowScope,
  ownMatch: ReturnType<typeof bestFieldMatch>,
): number => {
  const tabScore = bestFieldMatch(scope.query, spaceSearchTabs(space, scope))?.score ?? -Infinity;

  return Math.max(ownMatch?.score ?? -Infinity, tabScore);
};

const spaceScore = (
  space: SpaceInfo,
  scope: RowScope,
  ownMatch: ReturnType<typeof bestFieldMatch>,
): SpaceMatch | null => {
  const stackMatch = stackMatchOf(
    scope.query,
    stackForSpace(scope.data.stored, space, scope.data.panes),
  );

  const nameScore = fuzzyMatch(scope.query, space.name)?.score ?? 0;

  // An exact PR match is its own tier, so this score only orders matches within that tier.
  if (stackMatch?.tier === 'exact') {
    return { exact: true, score: nameScore, reason: stackMatch.reason };
  }

  const fieldScore = fieldScoreOf(space, scope, ownMatch);
  const best = Math.max(fieldScore, stackMatch?.score ?? -Infinity);

  if (best === -Infinity) {
    return null;
  }

  const reason = stackMatch !== null && stackMatch.score > fieldScore ? stackMatch.reason : null;

  return { exact: false, score: best + nameScore, reason };
};

const spaceTarget = (
  space: SpaceInfo,
  scope: RowScope,
  ownMatch: ReturnType<typeof bestFieldMatch>,
  firstShownPane: PaneInfo | null,
): PaneInfo | null => {
  const unique = uniquePaneMatch(space, scope, ownMatch);

  if (scope.statuses === null) {
    return unique;
  }

  if (unique !== null) {
    return unique;
  }

  return firstShownPane ?? scope.owners?.spaces[space.id] ?? null;
};

const spaceRows = (space: SpaceInfo, scope: RowScope): RowGroup | null => {
  const { data, statuses } = scope;

  if (!matchesStatus(data.statuses.spaces[space.id] ?? null, statuses)) {
    return null;
  }

  const tabPanes = space.tabs.flatMap((tab) => panesOf(tab, data.panes));

  const firstShownPane =
    statuses === null ? null : (tabPanes.find((pane) => inStatus(pane, statuses)) ?? null);

  const ownMatch =
    scope.query === '' ? null : bestFieldMatch(scope.query, spaceOwnFields(space, data));

  const target = spaceTarget(space, scope, ownMatch, firstShownPane);

  const filteredTab = space.tabs.find((tab) => tab.id === target?.tab);
  const statusTab = statuses === null ? undefined : statusMatchingTab(space, statuses, data);

  const shownTab =
    filteredTab ?? statusTab ?? space.tabs.find((tab) => tab.active) ?? space.tabs[0];

  const scored =
    scope.query === ''
      ? { exact: false, score: 0, reason: null }
      : spaceScore(space, scope, ownMatch);

  if (scored === null) {
    return null;
  }

  const spaceRow: PickerRow = {
    kind: 'space',
    key: `space:${space.id}`,
    space,
    tab: shownTab,
    pane: target,
    reason: scored.reason,
  };

  const rows = [spaceRow, ...space.tabs.flatMap((tab) => tabChildRows(space, tab, scope))];

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
  const scope: RowScope = {
    query,
    tasks: query === '' ? new Map<unknown, string>() : taskIndexOf(data.terminals),
    statuses,
    owners: statuses === null ? null : rollupOwners(data.spaces, data.panes, data.terminals),
    data,
  };

  const groups = recentOrder(data)
    .map((space) => spaceRows(space, scope))
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
