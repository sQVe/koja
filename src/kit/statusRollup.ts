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

const paneTabOf = (paneList: readonly PaneInfo[]): Map<string, string> => {
  const paneTab = new Map<string, string>();

  for (const pane of paneList) {
    if (pane.terminal !== null) {
      paneTab.set(pane.terminal, pane.tab);
    }
  }

  return paneTab;
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

const ancestorTab = (
  terminal: CoreTerminal,
  terminalsByAddress: ReadonlyMap<string, CoreTerminal>,
  paneTab: ReadonlyMap<string, string>,
): string | null => {
  const seen = new Set<string>([terminal.address]);
  let parent = terminal.parent;

  while (parent !== null && !seen.has(parent)) {
    const tab = paneTab.get(parent);

    if (tab !== undefined) {
      return tab;
    }

    seen.add(parent);
    parent = terminalsByAddress.get(parent)?.parent ?? null;
  }

  return null;
};

const descendantStatusesByTab = (
  terminalList: readonly CoreTerminal[],
  paneTab: ReadonlyMap<string, string>,
): Record<string, Status[]> => {
  const terminalsByAddress = new Map(terminalList.map((terminal) => [terminal.address, terminal]));
  const byTab: Record<string, Status[]> = {};

  for (const terminal of terminalList) {
    if (paneTab.has(terminal.address)) {
      continue;
    }

    const status = backgroundStatus(terminal.status);
    const tab = status === null ? null : ancestorTab(terminal, terminalsByAddress, paneTab);

    if (status !== null && tab !== null) {
      (byTab[tab] ??= []).push(status);
    }
  }

  return byTab;
};

export const rollupStatuses = (
  spaceList: readonly SpaceInfo[],
  paneList: readonly PaneInfo[],
  terminalList: readonly unknown[],
): StatusRollup => {
  const paneTab = paneTabOf(paneList);
  const paneStatuses = paneStatusesByTab(paneList);
  const descendantStatuses = descendantStatusesByTab(readTerminals(terminalList), paneTab);

  const tabs: Record<string, Status | null> = {};

  for (const space of spaceList) {
    for (const tab of space.tabs) {
      const statuses = [...(paneStatuses[tab.id] ?? []), ...(descendantStatuses[tab.id] ?? [])];

      tabs[tab.id] = bestOf(statuses);
    }
  }

  const spaces: Record<string, Status | null> = {};

  for (const space of spaceList) {
    spaces[space.id] = bestOf(space.tabs.map((tab) => tabs[tab.id] ?? null));
  }

  return { spaces, tabs };
};
