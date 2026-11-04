import { focused, run, spaces } from 'herdr';

import { openConfirm, openPrompt } from './dialogOpen.ts';
import type { ConfirmDialog, PromptDialog } from './dialogPayload.ts';
import { stringOf } from './fields.ts';

interface TabFacts {
  id: string;
  name: string;
  named: boolean;
  panes: number;
}

interface SpaceFacts {
  id: string;
  name: string;
  named: boolean;
  tabs: TabFacts[];
}

interface FocusFacts {
  space: string;
  tab: string;
}

type AskPlan =
  | { kind: 'run' }
  | { kind: 'skip' }
  | { kind: 'confirm'; dialog: ConfirmDialog }
  | { kind: 'prompt'; dialog: PromptDialog };

type PlanFunction = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
) => AskPlan;

const spaceTarget = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): SpaceFacts | undefined => {
  const id = stringOf(args['id']) ?? focus?.space;

  return spaceList.find((space) => space.id === id);
};

const tabTarget = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): TabFacts | undefined => {
  const id = stringOf(args['id']);

  if (id !== null) {
    return spaceList.flatMap((space) => space.tabs).find((tab) => tab.id === id);
  }

  const focusedSpace = spaceList.find((space) => space.id === focus?.space);

  return focusedSpace?.tabs.find((tab) => tab.id === focus?.tab);
};

const spaceDetail = (space: SpaceFacts): string => {
  const terminals = space.tabs.reduce((total, tab) => total + tab.panes, 0);

  return `${space.name} — ${space.tabs.length} tabs, ${terminals} terminals`;
};

const currentName = (target: { name: string; named: boolean }): string =>
  target.named ? target.name : '';

const closeSpacePlan = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): AskPlan => {
  if (args['confirmed'] === true) {
    return { kind: 'run' };
  }

  const space = spaceTarget(args, spaceList, focus);

  if (space === undefined) {
    return { kind: 'skip' };
  }

  return {
    kind: 'confirm',
    dialog: {
      title: 'Close space?',
      detail: spaceDetail(space),
      action: 'Close',
      destroys: true,
      command: { name: 'space.close', args: { id: space.id, confirmed: true } },
    },
  };
};

const renameSpacePlan = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): AskPlan => {
  if (stringOf(args['name']) !== null) {
    return { kind: 'run' };
  }

  const space = spaceTarget(args, spaceList, focus);

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

const renameTabPlan = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): AskPlan => {
  if (stringOf(args['name']) !== null) {
    return { kind: 'run' };
  }

  const tab = tabTarget(args, spaceList, focus);

  if (tab === undefined) {
    return { kind: 'skip' };
  }

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
const closeTabPlan = (
  args: Record<string, unknown>,
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): AskPlan => {
  if (args['confirmed'] === true) {
    return { kind: 'run' };
  }

  const tab = tabTarget(args, spaceList, focus);

  if (tab === undefined) {
    return { kind: 'skip' };
  }

  const space = spaceList.find((candidate) => candidate.tabs.includes(tab));

  if (space === undefined) {
    return { kind: 'skip' };
  }

  if (space.tabs.length > 1) {
    return { kind: 'run' };
  }

  return {
    kind: 'confirm',
    dialog: {
      title: 'Close space?',
      detail: spaceDetail(space),
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
  spaceList: SpaceFacts[],
  focus: FocusFacts | null,
): AskPlan => {
  const planner = planners.get(command);

  return planner === undefined ? { kind: 'run' } : planner(args, spaceList, focus);
};

export const askFirst = (command: string, args?: Record<string, unknown>): void => {
  const plan = dialogFor(command, args ?? {}, spaces(), focused());

  if (plan.kind === 'confirm') {
    openConfirm(plan.dialog);
  } else if (plan.kind === 'prompt') {
    openPrompt(plan.dialog);
  } else if (plan.kind === 'run') {
    run(command, args);
  }
};
