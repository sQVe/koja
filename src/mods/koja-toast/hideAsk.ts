import type { ToastProps } from './toastProps.ts';

export const hidesAsk = (action: ToastProps['action'], shown: ReadonlySet<string>): boolean => {
  if (action?.name !== 'agent.focus') {
    return false;
  }

  const terminal = action.args['terminal'];

  return typeof terminal === 'string' && shown.has(terminal);
};
