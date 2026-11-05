import { shortAge } from '../../kit/age.ts';

const millisecondsPerSecond = 1000;

const toSeconds = (milliseconds: number): number =>
  Math.floor(milliseconds / millisecondsPerSecond);

// goodAt is the epoch milliseconds of the last good read, or null when none succeeded. The age
// leads the stale text, so it survives when a narrow sidebar cuts the line.
export const readErrorLine = (subject: string, goodAt: number | null, now: number): string => {
  if (goodAt === null) {
    return `Could not read ${subject}.`;
  }

  const age = shortAge(toSeconds(goodAt), toSeconds(now));

  return age === 'now' ? `Could not refresh ${subject}.` : `${subject} are ${age} old.`;
};
