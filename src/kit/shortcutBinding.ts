import { bindingAction } from './binding.ts';
import { normalKeys } from './normalKeys.ts';

export interface KeyBinding {
  section: string;
  keys: string;
  action: string;
}

const hasNonStringFirstArg = (args: Record<string, unknown> | undefined): boolean => {
  const values = Object.values(args ?? {});

  return values.length > 0 && typeof values[0] !== 'string';
};

const normalKeyFor = (action: string): string | null => {
  for (const entry of normalKeys) {
    const normalAction = entry.action;

    if (normalAction.kind !== 'command') {
      continue;
    }

    if (hasNonStringFirstArg(normalAction.args)) {
      continue;
    }

    const actionString = bindingAction(normalAction.command, normalAction.args ?? {});

    if (actionString === action) {
      return entry.keys.join(' ');
    }
  }

  return null;
};

export const bindingFor = (
  bindings: readonly KeyBinding[],
  ...actions: string[]
): string | null => {
  const global = bindings.filter((candidate) => candidate.section === 'global');

  for (const action of actions) {
    const binding = global.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      return binding.keys;
    }

    const normalKey = normalKeyFor(action);

    if (normalKey !== null) {
      return normalKey;
    }
  }

  return null;
};
