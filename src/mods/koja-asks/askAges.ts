import { shortAge } from '../../kit/age.ts';
import { recordOf } from '../../kit/fields.ts';
import { parsedJson } from '../../kit/parsedJson.ts';

export type AskAges = Record<string, number>;

export interface AskAgesAdvance {
  ages: AskAges;
  changed: boolean;
}

const millisecondsPerSecond = 1000;

const timeOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const readAskAges = (text: string | null): AskAges => {
  const ages: AskAges = {};

  for (const [identity, value] of Object.entries(recordOf(parsedJson(text)))) {
    const since = timeOf(value);

    if (since !== null) {
      ages[identity] = since;
    }
  }

  return ages;
};

export const trackAskAges = (
  ages: Readonly<AskAges>,
  identities: readonly string[],
  now: number,
): AskAgesAdvance => {
  const next: AskAges = {};
  let added = false;

  for (const identity of identities) {
    const since = ages[identity];

    if (since === undefined) {
      added = true;
    }

    next[identity] = since ?? now;
  }

  const removed = Object.keys(ages).some((identity) => !Object.hasOwn(next, identity));

  return { ages: next, changed: added || removed };
};

export const askAgeOf = (ages: Readonly<AskAges>, identity: string, now: number): string => {
  const since = ages[identity] ?? now;

  return shortAge(since / millisecondsPerSecond, now / millisecondsPerSecond);
};
