import { actionIdentity, bindingAction, namesBinding } from './binding.ts';
import type { Platform } from './keys.ts';
import { formatStroke, keyStrokes } from './keys.ts';
import type { NormalKey } from './normalKeys.ts';
import { normalKeys } from './normalKeys.ts';

// The hint a row draws for the mode the overlay opened in: one keycap label per key of the
// sequence. This module declares the shape, so the keycap part imports it and stays free of a
// second copy.
export interface OverlayHint {
  normal: string[];
  insert?: string[];
}

export interface KeyBinding {
  section: string;
  keys: string;
  action: string;
}

type ActionKeys = Pick<KeyBinding, 'action' | 'keys'>;

interface NamedBinding {
  action: string;
  identity: string | null;
  keys: string;
}

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

const isPlainKey = (stroke: string): boolean => stroke.length === 1;

// A single-character key keeps its own name, so a letter stays lower case and the keycap can mark
// a shift. Every other stroke, a chord or a named key, takes its display form.
const capLabels = (keys: string, platform: Platform): string[] =>
  keyStrokes(keys).map((stroke) => (isPlainKey(stroke) ? stroke : formatStroke(stroke, platform)));

const namesAction = (binding: NamedBinding, action: string): boolean =>
  binding.action === action || binding.identity === action;

const namedBindings = (bindings: readonly ActionKeys[]): NamedBinding[] =>
  bindings.map((binding) => ({
    action: binding.action,
    identity: actionIdentity(binding.action),
    keys: binding.keys,
  }));

const findNamed = (bindings: readonly NamedBinding[], action: string): NamedBinding | undefined =>
  bindings.find((candidate) => namesAction(candidate, action));

const normalHint = (
  normal: readonly NamedBinding[],
  platform: Platform,
  actions: readonly string[],
): string[] => {
  for (const action of actions) {
    const binding = findNamed(normal, action);

    if (binding !== undefined) {
      return capLabels(binding.keys, platform);
    }
  }

  return [];
};

const insertHint = (
  global: readonly NamedBinding[],
  platform: Platform,
  actions: readonly string[],
): string[] | undefined => {
  for (const action of actions) {
    const binding = findNamed(global, action);

    if (binding !== undefined) {
      return capLabels(binding.keys, platform);
    }
  }

  return undefined;
};

export const bindingFor = (
  bindings: readonly KeyBinding[],
  ...actions: string[]
): string | null => {
  const normal = namedBindings(normalBindings);
  const global = namedBindings(globalBindings(bindings));

  for (const action of actions) {
    const binding = findNamed(normal, action) ?? findNamed(global, action);

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
): OverlayHint => {
  const normal = namedBindings(normalBindings);
  const global = namedBindings(globalBindings(bindings));
  const insert = insertHint(global, platform, actions);
  const hint: OverlayHint = { normal: normalHint(normal, platform, actions) };

  return insert === undefined ? hint : { ...hint, insert };
};
