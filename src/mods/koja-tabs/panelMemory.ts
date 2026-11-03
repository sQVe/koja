export interface PanelMemory {
  pending: { want: string | null; until: number } | null;
  space: string | undefined;
  stored: Record<string, string | null>;
}

export interface PanelView {
  now: string | null;
  space: string;
  enabled: string[];
  time: number;
}

type PanelEffect = { kind: 'none' } | { kind: 'show'; panel: string | null };

export interface PanelTransition {
  memory: PanelMemory;
  effect: PanelEffect;
  persisted: boolean;
}

interface Restore {
  asked: boolean;
  memory: PanelMemory;
  effect: PanelEffect;
}

export const restoreMilliseconds = 1000;

const noEffect: PanelEffect = { kind: 'none' };

export const initialPanelMemory = (stored: Record<string, string | null>): PanelMemory => ({
  pending: null,
  space: undefined,
  stored,
});

const restore = (memory: PanelMemory, view: PanelView): Restore => {
  const first = memory.space === undefined;

  const moved: PanelMemory = { ...memory, space: view.space, pending: null };

  if (first && !(view.space in moved.stored)) {
    return { asked: false, memory: moved, effect: noEffect };
  }

  const stored = moved.stored[view.space] ?? null;
  const want = stored !== null && view.enabled.includes(stored) ? stored : null;

  if (want === view.now) {
    return { asked: false, memory: moved, effect: noEffect };
  }

  const pending = { want, until: view.time + restoreMilliseconds };

  return { asked: true, memory: { ...moved, pending }, effect: { kind: 'show', panel: want } };
};

export const panelMemory = (memory: PanelMemory, view: PanelView): PanelTransition => {
  let current = memory;

  if (current.space !== view.space) {
    const restored = restore(current, view);

    if (restored.asked) {
      return { memory: restored.memory, effect: restored.effect, persisted: false };
    }

    current = restored.memory;
  }

  const { pending } = current;

  if (pending !== null) {
    if (pending.want !== view.now && view.time < pending.until) {
      return { memory: current, effect: noEffect, persisted: false };
    }

    current = { ...current, pending: null };
  }

  if (current.stored[view.space] === view.now) {
    return { memory: current, effect: noEffect, persisted: false };
  }

  const stored = { ...current.stored, [view.space]: view.now };

  return { memory: { ...current, stored }, effect: noEffect, persisted: true };
};
