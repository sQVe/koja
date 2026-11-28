import { stringOf } from '../../kit/fields.ts';
import type { ToastProps } from './toastProps.ts';

export const hidesAsk = (
  action: ToastProps['action'],
  shown: () => ReadonlySet<string>,
): boolean => {
  if (action?.name !== 'agent.focus') {
    return false;
  }

  const terminal = stringOf(action.args['terminal']);

  return terminal !== null && shown().has(terminal);
};
