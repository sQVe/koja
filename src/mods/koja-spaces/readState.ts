import { shortAge } from '../../kit/age.ts';

const millisecondsPerSecond = 1000;

const lastRead = (goodAt: number, now: number): string => {
  const age = shortAge(
    Math.floor(goodAt / millisecondsPerSecond),
    Math.floor(now / millisecondsPerSecond),
  );

  return age === 'now' ? 'just now' : `${age} ago`;
};

// goodAt is the epoch milliseconds of the last good read, or null when none succeeded.
export const readErrorLine = (subject: string, goodAt: number | null, now: number): string => {
  const line = `Could not read ${subject}.`;

  if (goodAt === null) {
    return line;
  }

  return `${line} Last read ${lastRead(goodAt, now)}.`;
};
