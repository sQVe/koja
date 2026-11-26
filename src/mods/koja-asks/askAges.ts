import { shortAge } from '../../kit/age.ts';

export type AskAges = Record<string, number>;

const millisecondsPerSecond = 1000;

export const trackAskAges = (
  ages: Readonly<AskAges>,
  identities: readonly string[],
  now: number,
): AskAges => {
  const next: AskAges = {};

  for (const identity of identities) {
    next[identity] = ages[identity] ?? now;
  }

  return next;
};

export const askAgeOf = (ages: Readonly<AskAges>, identity: string, now: number): string =>
  shortAge((ages[identity] ?? now) / millisecondsPerSecond, now / millisecondsPerSecond);
