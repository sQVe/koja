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

// A key action names its command and arguments in shorthand or as a JSON object.
const namesAction = (binding: ActionKeys, action: string): boolean =>
  binding.action === action || actionIdentity(binding.action) === action;

const normalHint = (platform: Platform, actions: readonly string[]): string[] => {
  for (const action of actions) {
    const binding = normalBindings.find((candidate) => namesAction(candidate, action));

    if (binding !== undefined) {
      return capLabels(binding.keys, platform);
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
    const binding = global.find((candidate) => namesAction(candidate, action));

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
  const global = globalBindings(bindings);

  for (const action of actions) {
    const binding =
      normalBindings.find((candidate) => namesAction(candidate, action)) ??
      global.find((candidate) => namesAction(candidate, action));

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
  const insert = insertHint(bindings, platform, actions);
  const hint: OverlayHint = { normal: normalHint(platform, actions) };

  return insert === undefined ? hint : { ...hint, insert };
};
