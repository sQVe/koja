import type { Ask } from './askFacts.ts';

export type CardMode = 'insert' | 'normal';

export interface OpenCard {
  id: string;
  identity: string;
  mode: CardMode;
}

export interface CardPlan {
  close: string | null;
  open: Ask | null;
  handled: string[];
  handledChanged: boolean;
}

export interface PlanSources {
  asks: readonly Ask[];
  live: readonly Ask[];
  handled: readonly string[];
  open: OpenCard | null;
  mode: CardMode;
}

const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const planCard = (sources: PlanSources): CardPlan => {
  const live = new Set(sources.live.map((ask) => ask.identity));
  const handled = sources.handled.filter((identity) => live.has(identity));
  const handledChanged = !sameList(handled, sources.handled);
  const shown = sources.asks.find((ask) => !handled.includes(ask.identity)) ?? null;

  if (shown === null) {
    return { close: sources.open?.id ?? null, open: null, handled, handledChanged };
  }

  if (
    sources.open !== null &&
    sources.open.identity === shown.identity &&
    sources.open.mode === sources.mode
  ) {
    return { close: null, open: null, handled, handledChanged };
  }

  return { close: sources.open?.id ?? null, open: shown, handled, handledChanged };
};
