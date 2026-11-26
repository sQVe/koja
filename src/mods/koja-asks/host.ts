import type { Ask } from './askFacts.ts';

export interface OpenCard {
  id: string;
  identity: string;
  signature: string;
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
  visible: readonly string[];
  open: OpenCard | null;
  signatures: ReadonlyMap<string, string>;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

export const planCard = (sources: PlanSources): CardPlan => {
  const live = new Set(sources.live.map((ask) => ask.identity));

  const handled = unique([...sources.handled, ...sources.visible]).filter((identity) =>
    live.has(identity),
  );

  const handledChanged = !sameSet(handled, sources.handled);
  // `asks` arrives newest first, so the first unhandled entry is the newest.
  const shown = sources.asks.find((ask) => !handled.includes(ask.identity)) ?? null;

  if (shown === null) {
    return { close: sources.open?.id ?? null, open: null, handled, handledChanged };
  }

  const signature = sources.signatures.get(shown.identity) ?? '';

  const current =
    sources.open !== null &&
    sources.open.identity === shown.identity &&
    sources.open.signature === signature;

  if (current) {
    return { close: null, open: null, handled, handledChanged };
  }

  return { close: sources.open?.id ?? null, open: shown, handled, handledChanged };
};
