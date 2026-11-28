import type { PaneInfo, SpaceInfo, Status } from 'herdr';

import { recordOf, stringOf } from './fields.ts';

export interface CoreTerminal {
  address: string;
  parent: string | null;
  status: string | null;
}

export interface StatusRollup {
  spaces: Record<string, Status | null>;
  tabs: Record<string, Status | null>;
}

interface DescendantContribution {
  status: Status;
  owner: PaneInfo;
}

// A null owner means the status comes from the tab or space itself, or that it has no status at all.
export interface StatusOwners {
  spaces: Record<string, PaneInfo | null>;
  tabs: Record<string, PaneInfo | null>;
}

export const readTerminals = (records: readonly unknown[]): CoreTerminal[] =>
  records.map((record) => {
    const terminal = recordOf(record);

    return {
      address: stringOf(terminal['address']) ?? '',
      parent: stringOf(terminal['parent']),
      status: stringOf(terminal['status']),
    };
  });

const statusRanks: Record<Status, number> = { blocked: 4, working: 3, done: 2, idle: 1 };

export const statusRank = (status: Status | null | undefined): number =>
  status === null || status === undefined ? 0 : statusRanks[status];

const backgroundStatus = (word: string | null): Status | null => {
  if (word === 'working') {
    return 'working';
  }

  return word === 'blocked' || word === 'error' ? 'blocked' : null;
};

const bestOf = (statuses: readonly (Status | null)[]): Status | null =>
  statuses.reduce<Status | null>(
    (best, status) => (statusRank(status) > statusRank(best) ? status : best),
    null,
  );

const paneByTerminal = (paneList: readonly PaneInfo[]): Map<string, PaneInfo> => {
  const byTerminal = new Map<string, PaneInfo>();

  for (const pane of paneList) {
    if (pane.terminal !== null) {
      byTerminal.set(pane.terminal, pane);
    }
  }

  return byTerminal;
};

const paneStatusesByTab = (paneList: readonly PaneInfo[]): Record<string, (Status | null)[]> => {
  const byTab: Record<string, (Status | null)[]> = {};

  for (const pane of paneList) {
    if (pane.terminal === null) {
      continue;
    }

    (byTab[pane.tab] ??= []).push(pane.status);
  }

  return byTab;
};

const ancestorPane = (
  terminal: CoreTerminal,
  terminalsByAddress: ReadonlyMap<string, CoreTerminal>,
  panesByTerminal: ReadonlyMap<string, PaneInfo>,
): PaneInfo | null => {
  const seen = new Set<string>([terminal.address]);
  let parent = terminal.parent;

  while (parent !== null && !seen.has(parent)) {
    const pane = panesByTerminal.get(parent);

    if (pane !== undefined) {
      return pane;
    }

    seen.add(parent);
    parent = terminalsByAddress.get(parent)?.parent ?? null;
  }

  return null;
};

const descendantContributions = (
  terminalList: readonly CoreTerminal[],
  panesByTerminal: ReadonlyMap<string, PaneInfo>,
): Record<string, DescendantContribution[]> => {
  const terminalsByAddress = new Map(terminalList.map((terminal) => [terminal.address, terminal]));
  const byTab: Record<string, DescendantContribution[]> = {};

  for (const terminal of terminalList) {
    if (panesByTerminal.has(terminal.address)) {
      continue;
    }

    const status = backgroundStatus(terminal.status);

    const owner =
      status === null ? null : ancestorPane(terminal, terminalsByAddress, panesByTerminal);

    if (status !== null && owner !== null) {
      (byTab[owner.tab] ??= []).push({ status, owner });
    }
  }

  return byTab;
};

const tabStatusOf = (
  tabId: string,
  paneStatuses: Readonly<Record<string, (Status | null)[]>>,
  contributions: Readonly<Record<string, DescendantContribution[]>>,
): Status | null =>
  bestOf([
    ...(paneStatuses[tabId] ?? []),
    ...(contributions[tabId] ?? []).map((contribution) => contribution.status),
  ]);

const spaceStatusOf = (
  space: SpaceInfo,
  tabs: Readonly<Record<string, Status | null>>,
): Status | null => bestOf(space.tabs.map((tab) => tabs[tab.id] ?? null));

export const rollupStatuses = (
  spaceList: readonly SpaceInfo[],
  paneList: readonly PaneInfo[],
  terminalList: readonly unknown[],
): StatusRollup => {
  const paneStatuses = paneStatusesByTab(paneList);

  const contributions = descendantContributions(
    readTerminals(terminalList),
    paneByTerminal(paneList),
  );

  const tabs: Record<string, Status | null> = {};

  for (const space of spaceList) {
    for (const tab of space.tabs) {
      tabs[tab.id] = tabStatusOf(tab.id, paneStatuses, contributions);
    }
  }

  const spaces: Record<string, Status | null> = {};

  for (const space of spaceList) {
    spaces[space.id] = spaceStatusOf(space, tabs);
  }

  return { spaces, tabs };
};

const panePosition = (paneList: readonly PaneInfo[]): Map<string, number> =>
  new Map(paneList.map((pane, index) => [pane.pane, index]));

const earliestPane = (
  panes: readonly PaneInfo[],
  position: ReadonlyMap<string, number>,
): PaneInfo | null => {
  let earliest: PaneInfo | null = null;
  let earliestAt = Number.POSITIVE_INFINITY;

  for (const pane of panes) {
    const at = position.get(pane.pane) ?? Number.POSITIVE_INFINITY;

    if (at < earliestAt) {
      earliest = pane;
      earliestAt = at;
    }
  }

  return earliest;
};

const comesOnlyFromBackground = (
  rolledStatus: Status | null,
  paneStatuses: readonly (Status | null)[],
): boolean => rolledStatus !== null && statusRank(rolledStatus) > statusRank(bestOf(paneStatuses));

const tabOwner = (
  tabStatus: Status | null,
  paneStatuses: readonly (Status | null)[],
  contributions: readonly DescendantContribution[],
  position: ReadonlyMap<string, number>,
): PaneInfo | null => {
  if (!comesOnlyFromBackground(tabStatus, paneStatuses)) {
    return null;
  }

  const owners = contributions
    .filter((contribution) => statusRank(contribution.status) === statusRank(tabStatus))
    .map((contribution) => contribution.owner);

  return earliestPane(owners, position);
};

const spaceOwner = (
  space: SpaceInfo,
  tabs: Readonly<Record<string, Status | null>>,
  tabOwners: Readonly<Record<string, PaneInfo | null>>,
  paneStatuses: Readonly<Record<string, (Status | null)[]>>,
): PaneInfo | null => {
  const spaceStatus = spaceStatusOf(space, tabs);
  const spacePanes = space.tabs.flatMap((tab) => paneStatuses[tab.id] ?? []);

  if (!comesOnlyFromBackground(spaceStatus, spacePanes)) {
    return null;
  }

  for (const tab of space.tabs) {
    if (statusRank(tabs[tab.id] ?? null) !== statusRank(spaceStatus)) {
      continue;
    }

    return tabOwners[tab.id] ?? null;
  }

  return null;
};

export const rollupOwners = (
  spaceList: readonly SpaceInfo[],
  paneList: readonly PaneInfo[],
  terminalList: readonly unknown[],
): StatusOwners => {
  const paneStatuses = paneStatusesByTab(paneList);

  const contributions = descendantContributions(
    readTerminals(terminalList),
    paneByTerminal(paneList),
  );

  const position = panePosition(paneList);

  const tabs: Record<string, Status | null> = {};
  const owners: Record<string, PaneInfo | null> = {};

  for (const space of spaceList) {
    for (const tab of space.tabs) {
      const status = tabStatusOf(tab.id, paneStatuses, contributions);

      tabs[tab.id] = status;

      owners[tab.id] = tabOwner(
        status,
        paneStatuses[tab.id] ?? [],
        contributions[tab.id] ?? [],
        position,
      );
    }
  }

  const spaces: Record<string, PaneInfo | null> = {};

  for (const space of spaceList) {
    spaces[space.id] = spaceOwner(space, tabs, owners, paneStatuses);
  }

  return { spaces, tabs: owners };
};
