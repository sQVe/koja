import { focused, panes, run, shared, spaces } from 'herdr';

import { dialogFor } from './askPlan.ts';
import { openConfirm, openPrompt } from './dialogOpen.ts';
import { readSpaceOrder, spaceStepCommand } from './spaceOrder.ts';

const spaceSteps = new Map([
  ['space.next', 1],
  ['space.prev', -1],
]);

const stepSpace = (step: number): void => {
  const command = spaceStepCommand(step, {
    order: readSpaceOrder(shared),
    liveIds: spaces().map((space) => space.id),
    current: focused()?.space ?? null,
  });

  if (command !== null) {
    run(command.name, command.args);
  }
};

export const askFirst = (command: string, args?: Record<string, unknown>): boolean => {
  const spaceStep = spaceSteps.get(command);

  if (spaceStep !== undefined) {
    stepSpace(spaceStep);

    return false;
  }

  const plan = dialogFor(command, args ?? {}, {
    spaces: spaces(),
    panes: panes(),
    focus: focused(),
  });

  if (plan.kind === 'confirm') {
    openConfirm(plan.dialog);

    return true;
  }

  if (plan.kind === 'prompt') {
    openPrompt(plan.dialog);

    return true;
  }

  if (plan.kind === 'run') {
    run(command, args);
  }

  return false;
};
