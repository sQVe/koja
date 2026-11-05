import type { PaneInfo, SpaceInfo, TabInfo } from 'herdr';

import type { ConfirmDialog, PromptDialog } from './dialogPayload.ts';
import { stringOf } from './fields.ts';

interface AskFocus {
  space: string;
  tab: string;
}

export interface AskFacts {
  spaces: SpaceInfo[];
  panes: PaneInfo[];
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

const terminalCount = (space: SpaceInfo, paneList: PaneInfo[]): number => {
  const tabIds = new Set(space.tabs.map((tab) => tab.id));

  return paneList.filter((pane) => tabIds.has(pane.tab) && pane.terminal !== null).length;
};

const spaceDetail = (space: SpaceInfo, paneList: PaneInfo[]): string =>
  `${space.name} — ${space.tabs.length} tabs, ${terminalCount(space, paneList)} terminals`;

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
    dialog: {
      title: 'Close space?',
      detail: spaceDetail(space, facts.panes),
      action: 'Close',
      destroys: true,
      command: { name: 'space.close', args: { id: space.id, confirmed: true } },
    },
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
const closeTabPlan = (args: Record<string, unknown>, facts: AskFacts): AskPlan => {
  if (args['confirmed'] === true) {
    return { kind: 'run' };
  }

  const place = tabTarget(args, facts);

  if (place === undefined) {
    return { kind: 'skip' };
  }

  const { space, tab } = place;

  if (space.tabs.length > 1) {
    return { kind: 'run' };
  }

  return {
    kind: 'confirm',
    dialog: {
      title: 'Close space?',
      detail: spaceDetail(space, facts.panes),
      action: 'Close',
      destroys: true,
      command: { name: 'tab.close', args: { id: tab.id, confirmed: true } },
    },
  };
};

const planners = new Map<string, PlanFunction>([
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
