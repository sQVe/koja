import { bindingAction } from './binding.ts';
import type { NormalKey } from './normalKeys.ts';
import { normalKeys } from './normalKeys.ts';

export interface KeyBinding {
  section: string;
  keys: string;
  action: string;
}

type ActionKeys = Pick<KeyBinding, 'action' | 'keys'>;

const hasNonStringFirstArg = (args: Record<string, unknown> | undefined): boolean => {
  const values = Object.values(args ?? {});

  return values.length > 0 && typeof values[0] !== 'string';
};

const normalBinding = (entry: NormalKey): ActionKeys[] => {
  const normalAction = entry.action;

  if (normalAction.kind !== 'command') {
    return [];
  }

  if (hasNonStringFirstArg(normalAction.args)) {
    return [];
  }

  const action = bindingAction(normalAction.command, normalAction.args ?? {});

  return [{ action, keys: entry.keys.join(' ') }];
};

const shortestFirst = normalKeys.toSorted(
  (first, second) => first.keys.length - second.keys.length,
);

const normalBindings = shortestFirst.flatMap(normalBinding);

export const bindingFor = (
  bindings: readonly KeyBinding[],
  ...actions: string[]
): string | null => {
  const global = bindings.filter((candidate) => candidate.section === 'global');

  for (const action of actions) {
    const binding =
      normalBindings.find((candidate) => candidate.action === action) ??
      global.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      return binding.keys;
    }
  }

  return null;
};
