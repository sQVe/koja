import type { Ask } from './askFacts.ts';

export interface OpenCard {
  id: string;
  identity: string;
  signature: string;
}

export interface CardPlan {
  close: string | null;
  open: Ask | null;
  sound: boolean;
  handled: string[];
  handledChanged: boolean;
  sounded: string[];
  soundedChanged: boolean;
}

export interface PlanSources {
  asks: readonly Ask[];
  live: readonly Ask[];
  handled: readonly string[];
  sounded: readonly string[];
  visible: readonly string[];
  open: OpenCard | null;
  signatures: ReadonlyMap<string, string>;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

const liveOnly = (identities: readonly string[], live: ReadonlySet<string>): string[] =>
  unique(identities).filter((identity) => live.has(identity));

const cardIsCurrent = (open: OpenCard | null, shown: Ask, signature: string): boolean =>
  open !== null && open.identity === shown.identity && open.signature === signature;

export const planCard = (sources: PlanSources): CardPlan => {
  const live = new Set(sources.live.map((ask) => ask.identity));

  const handled = liveOnly([...sources.handled, ...sources.visible], live);

  const sounded = liveOnly(sources.sounded, live);

  // `asks` arrives newest first, so the first unhandled entry is the newest.
  const shown = sources.asks.find((ask) => !handled.includes(ask.identity)) ?? null;

  // An open card has already alerted the user for its ask, even when the sound list predates it.
  const sound = shown !== null && !sounded.includes(shown.identity);
  const nextSounded = sound ? [...sounded, shown.identity] : sounded;

  const plan: CardPlan = {
    close: null,
    open: null,
    sound: false,
    handled,
    handledChanged: !sameSet(handled, sources.handled),
    sounded: nextSounded,
    soundedChanged: !sameSet(nextSounded, sources.sounded),
  };

  if (shown === null) {
    return { ...plan, close: sources.open?.id ?? null };
  }

  const signature = sources.signatures.get(shown.identity) ?? '';

  if (cardIsCurrent(sources.open, shown, signature)) {
    return plan;
  }

  return { ...plan, close: sources.open?.id ?? null, open: shown, sound };
};
