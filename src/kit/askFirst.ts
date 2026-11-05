import { focused, panes, run, spaces } from 'herdr';

import { dialogFor } from './askPlan.ts';
import { openConfirm, openPrompt } from './dialogOpen.ts';

export const askFirst = (command: string, args?: Record<string, unknown>): boolean => {
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
