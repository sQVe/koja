import { focused, panes, run, shared, spaces, terminals } from 'herdr';

import type { AskFacts } from './askPlan.ts';
import { dialogFor } from './askPlan.ts';
import { openConfirm, openPrompt } from './dialogOpen.ts';
import { recordOf, stringOf } from './fields.ts';
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

const terminalLifetime = (value: unknown): AskFacts['terminals'][number] => {
  const terminal = recordOf(value);
  const labels = recordOf(terminal['labels']);

  return {
    address: stringOf(terminal['address']) ?? '',
    parent: stringOf(terminal['parent']),
    live: terminal['state'] === 'live',
    dieWithParent: terminal['die_with_parent'] === true,
    space: stringOf(labels['herdr.space']),
  };
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
    terminals: terminals().map(terminalLifetime),
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
