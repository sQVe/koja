import { bindingAction, namesBinding } from './binding.ts';
import type { Platform } from './keys.ts';
import { formatKeys } from './keys.ts';
import type { NormalKey } from './normalKeys.ts';
import { normalKeys } from './normalKeys.ts';

// The hint a row draws for the mode the overlay opened in. The kit's keycap part has the same
// shape, and this module stays free of GPUI imports so a plain test can import it.
export interface ModeHint {
  normal: string[];
  insert?: string[];
}

export interface KeyBinding {
  section: string;
  keys: string;
  action: string;
}

type ActionKeys = Pick<KeyBinding, 'action' | 'keys'>;

const hasUnnamedFirstArg = (args: Record<string, unknown> | undefined): boolean => {
  const values = Object.values(args ?? {});

  return values.length > 0 && !namesBinding(values[0]);
};

const normalBinding = (entry: NormalKey): ActionKeys[] => {
  const normalAction = entry.action;

  if (normalAction.kind !== 'command') {
    return [];
  }

  if (hasUnnamedFirstArg(normalAction.args)) {
    return [];
  }

  const action = bindingAction(normalAction.command, normalAction.args ?? {});

  return [{ action, keys: entry.keys.join(' ') }];
};

const shortestFirst = normalKeys.toSorted(
  (first, second) => first.keys.length - second.keys.length,
);

const normalBindings = shortestFirst.flatMap(normalBinding);

const globalBindings = (bindings: readonly KeyBinding[]): KeyBinding[] =>
  bindings.filter((candidate) => candidate.section === 'global');

const normalHint = (actions: readonly string[]): string[] => {
  for (const action of actions) {
    const binding = normalBindings.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      return binding.keys.split(' ');
    }
  }

  return [];
};

const insertHint = (
  bindings: readonly KeyBinding[],
  platform: Platform,
  actions: readonly string[],
): string[] | undefined => {
  const global = globalBindings(bindings);

  for (const action of actions) {
    const binding = global.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      const strokes = binding.keys
        .trim()
        .split(/\s+/)
        .filter((stroke) => stroke !== '');

      return strokes.map((stroke) => formatKeys(stroke, platform));
    }
  }

  return undefined;
};

export const bindingFor = (
  bindings: readonly KeyBinding[],
  ...actions: string[]
): string | null => {
  const global = globalBindings(bindings);

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

export const hintFor = (
  bindings: readonly KeyBinding[],
  platform: Platform,
  ...actions: string[]
): ModeHint => {
  const insert = insertHint(bindings, platform, actions);
  const hint: ModeHint = { normal: normalHint(actions) };

  return insert === undefined ? hint : { ...hint, insert };
};
