import type { AgentInfo, PaneInfo, SpaceInfo, TabInfo } from 'herdr';

import type { ConfirmDialog, DialogCommand, PromptDialog } from './dialogPayload.ts';
import { stringOf } from './fields.ts';

interface AskFocus {
  space: string;
  tab: string;
  pane: string | null;
}

interface TerminalLifetime {
  address: string;
  parent: string | null;
  live: boolean;
  dieWithParent: boolean;
  space?: string | null;
}

export interface AskFacts {
  terminals: TerminalLifetime[];
  spaces: SpaceInfo[];
  panes: PaneInfo[];
  agents: AgentInfo[];
  focus: AskFocus | null;
}

type AskPlan =
  | { kind: 'run' }
  | { kind: 'skip' }
  | { kind: 'confirm'; dialog: ConfirmDialog }
  | { kind: 'prompt'; dialog: PromptDialog };

type PlanFunction = (args: Record<string, unknown>, facts: AskFacts) => AskPlan;

interface TabPlace {
  space: SpaceInfo;
  tab: TabInfo;
}

interface AgentGroup {
  name: string;
  count: number;
}

const spaceTarget = (args: Record<string, unknown>, facts: AskFacts): SpaceInfo | undefined => {
  const id = stringOf(args['id']) ?? facts.focus?.space;

  return facts.spaces.find((space) => space.id === id);
};

const placeOf = (spaceList: SpaceInfo[], tabId: string | undefined): TabPlace | undefined => {
  for (const space of spaceList) {
    const tab = space.tabs.find((candidate) => candidate.id === tabId);

    if (tab !== undefined) {
      return { space, tab };
    }
  }

  return undefined;
};

const tabTarget = (args: Record<string, unknown>, facts: AskFacts): TabPlace | undefined => {
  const id = stringOf(args['id']);

  if (id !== null) {
    return placeOf(facts.spaces, id);
  }

  const focusedSpaces = facts.spaces.filter((space) => space.id === facts.focus?.space);

  return placeOf(focusedSpaces, facts.focus?.tab);
};

const spaceAgents = (space: SpaceInfo, agentList: AgentInfo[]): AgentInfo[] =>
  agentList.filter((agent) => agent.space === space.id);

const uniqueAgents = (agents: AgentInfo[]): AgentInfo[] => {
  const seen = new Set<string>();

  return agents.filter((agent) => {
    if (seen.has(agent.address)) {
      return false;
    }

    seen.add(agent.address);

    return true;
  });
};

const agentGroups = (agents: AgentInfo[]): AgentGroup[] => {
  const counts = new Map<string, number>();

  for (const agent of agents) {
    counts.set(agent.program.name, (counts.get(agent.program.name) ?? 0) + 1);
  }

  return [...counts].map(([name, count]) => ({ name, count }));
};

const groupLabel = (group: AgentGroup, counted: boolean): string => {
  if (group.count === 1 && !counted) {
    return group.name;
  }

  return `${group.count} ${group.name} ${group.count === 1 ? 'agent' : 'agents'}`;
};

const isMidTask = (agent: AgentInfo): boolean =>
  agent.status === 'working' || agent.status === 'blocked';

const namesInBothClauses = (midTask: AgentInfo[], other: AgentInfo[]): Set<string> => {
  const midTaskNames = new Set(midTask.map((agent) => agent.program.name));
  const shared = other.map((agent) => agent.program.name).filter((name) => midTaskNames.has(name));

  return new Set(shared);
};

const joinNames = (names: string[]): string => {
  if (names.length <= 2) {
    return names.join(' and ');
  }

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

const tabCount = (count: number): string => `${count} ${count === 1 ? 'tab closes' : 'tabs close'}`;

const clauseSubject = (agents: AgentInfo[], sharedNames: Set<string>): string => {
  const labels = agentGroups(agents).map((group) => groupLabel(group, sharedNames.has(group.name)));
  const verb = agents.length === 1 ? 'stops' : 'stop';

  return `${joinNames(labels)} ${verb}`;
};

const hasAgents = (agents: AgentInfo[]): boolean => agents.length > 0;

const midTaskClause = (agents: AgentInfo[], sharedNames: Set<string>): string =>
  hasAgents(agents) ? `${clauseSubject(agents, sharedNames)} mid-task` : '';

const otherClause = (agents: AgentInfo[], sharedNames: Set<string>): string =>
  hasAgents(agents) ? clauseSubject(agents, sharedNames) : '';

const closeStops = (agents: AgentInfo[]): string => {
  const unique = uniqueAgents(agents);
  const midTask = unique.filter(isMidTask);
  const other = unique.filter((agent) => !isMidTask(agent));
  const sharedNames = namesInBothClauses(midTask, other);

  const clauses = [midTaskClause(midTask, sharedNames), otherClause(other, sharedNames)].filter(
    (clause) => clause !== '',
  );

  return clauses.length === 0 ? '' : `${clauses.join(', ')}, and `;
};

const closeBody = (space: SpaceInfo, facts: AskFacts): string[] => {
  const stops = closeStops(spaceAgents(space, facts.agents));

  return [
    `${stops}${tabCount(space.tabs.length)}.`,
    'Its folder, uncommitted changes, and branch stay.',
  ];
};

const closeDialog = (space: SpaceInfo, facts: AskFacts, command: DialogCommand): ConfirmDialog => ({
  title: `Close space “${space.name}”?`,
  body: closeBody(space, facts),
  action: 'Close',
  destroys: true,
  command,
});

const currentName = (target: { name: string; named: boolean }): string =>
  target.named ? target.name : '';

const closeSpacePlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  if (args['confirmed'] === true) {
    return { kind: 'run' };
  }

  const space = spaceTarget(args, facts);

  if (space === undefined) {
    return { kind: 'skip' };
  }

  return {
    kind: 'confirm',
    dialog: closeDialog(space, facts, {
      name: 'space.close',
      args: { id: space.id, confirmed: true },
    }),
  };
};

const renameSpacePlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  if (stringOf(args['name']) !== null) {
    return { kind: 'run' };
  }

  const space = spaceTarget(args, facts);

  if (space === undefined) {
    return { kind: 'skip' };
  }

  return {
    kind: 'prompt',
    dialog: {
      title: 'Rename space',
      value: currentName(space),
      hint: 'empty: named after its folder',
      command: { name: 'space.rename', args: { id: space.id } },
    },
  };
};

const renameTabPlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  if (stringOf(args['name']) !== null) {
    return { kind: 'run' };
  }

  const place = tabTarget(args, facts);

  if (place === undefined) {
    return { kind: 'skip' };
  }

  const { tab } = place;

  return {
    kind: 'prompt',
    dialog: {
      title: 'Rename tab',
      value: currentName(tab),
      hint: 'empty: its number',
      command: { name: 'tab.rename', args: { id: tab.id } },
    },
  };
};

// Closing the last tab closes its space, so it gets the space wording, as in Herdr.
const closeLastTabPlan = (place: TabPlace, facts: AskFacts): AskPlan => ({
  kind: 'confirm',
  dialog: closeDialog(place.space, facts, {
    name: 'tab.close',
    args: { id: place.tab.id, confirmed: true },
  }),
});

const closeTabPlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  if (args['confirmed'] === true) {
    return { kind: 'run' };
  }

  const place = tabTarget(args, facts);

  if (place === undefined) {
    return { kind: 'skip' };
  }

  if (place.space.tabs.length > 1) {
    return { kind: 'run' };
  }

  return closeLastTabPlan(place, facts);
};

const addClosingChildren = (
  closing: Set<string>,
  terminals: TerminalLifetime[],
  closesWithParent: (terminal: TerminalLifetime) => boolean,
): void => {
  for (const parent of closing) {
    for (const terminal of terminals) {
      const liveChild = terminal.parent === parent && terminal.live;

      if (liveChild && closesWithParent(terminal)) {
        closing.add(terminal.address);
      }
    }
  }
};

const closingTerminals = (address: string | null, terminals: TerminalLifetime[]): Set<string> => {
  const closing = new Set<string>();

  if (address === null) {
    return closing;
  }

  closing.add(address);
  addClosingChildren(closing, terminals, (terminal) => (terminal.space ?? '') === '');

  // Core deaths do not restart Herdr's traversal of unlabelled children.
  addClosingChildren(closing, terminals, (terminal) => terminal.dieWithParent);

  return closing;
};

const collateralClosePlan = (pane: PaneInfo, place: TabPlace, facts: AskFacts): AskPlan | null => {
  const terminals = closingTerminals(pane.terminal, facts.terminals);

  const collateral = facts.panes.filter((candidate) => {
    const closes = candidate.terminal !== null && terminals.has(candidate.terminal);

    return candidate.pane !== pane.pane && closes;
  });

  if (collateral.length === 0) {
    return null;
  }

  const closedPanes = new Set([pane.pane, ...collateral.map((candidate) => candidate.pane)]);
  const spaceTabs = new Set(place.space.tabs.map((tab) => tab.id));

  const survives = facts.panes.some(
    (candidate) => spaceTabs.has(candidate.tab) && !closedPanes.has(candidate.pane),
  );

  const otherPanes = collateral.length === 1 ? '1 other pane' : `${collateral.length} other panes`;
  const command = { name: 'pane.close', args: { pane: pane.pane } };

  if (!survives) {
    return { kind: 'confirm', dialog: closeDialog(place.space, facts, command) };
  }

  return {
    kind: 'confirm',
    dialog: {
      title: 'Close pane?',
      body: [`This pane and ${otherPanes} will close.`],
      action: 'Close',
      destroys: true,
      command,
    },
  };
};

const closePanePlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  const id = stringOf(args['pane']) ?? facts.focus?.pane;
  const pane = facts.panes.find((candidate) => candidate.pane === id);
  const place = placeOf(facts.spaces, pane?.tab);

  if (place === undefined) {
    return { kind: 'run' };
  }

  if (pane !== undefined) {
    const collateral = collateralClosePlan(pane, place, facts);

    if (collateral !== null) {
      return collateral;
    }
  }

  const tabPanes = facts.panes.filter((candidate) => candidate.tab === place.tab.id);

  if (tabPanes.length > 1 || place.space.tabs.length > 1) {
    return { kind: 'run' };
  }

  return closeLastTabPlan(place, facts);
};

const planners = new Map<string, PlanFunction>([
  ['pane.close', closePanePlan],
  ['space.close', closeSpacePlan],
  ['space.rename', renameSpacePlan],
  ['tab.close', closeTabPlan],
  ['tab.rename', renameTabPlan],
]);

export const dialogFor = (
  command: string,
  args: Record<string, unknown>,
  facts: AskFacts,
): AskPlan => {
  const planner = planners.get(command);

  return planner === undefined ? { kind: 'run' } : planner(args, facts);
};
