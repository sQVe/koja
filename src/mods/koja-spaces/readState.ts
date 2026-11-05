import { shortAge } from '../../kit/age.ts';

export interface ReadState {
  // Epoch milliseconds of the last good read; null until one succeeds.
  goodAt: number | null;
  failed: boolean;
}

const millisecondsPerSecond = 1000;

export const readSucceeded = (now: number): ReadState => ({ goodAt: now, failed: false });

export const readFailed = (before: ReadState | undefined): ReadState => ({
  goodAt: before?.goodAt ?? null,
  failed: true,
});

const lastRead = (goodAt: number, now: number): string => {
  const age = shortAge(
    Math.floor(goodAt / millisecondsPerSecond),
    Math.floor(now / millisecondsPerSecond),
  );

  return age === 'now' ? 'just now' : `${age} ago`;
};

export const readErrorLine = (
  state: ReadState | undefined,
  subject: string,
  now: number,
): string | null => {
  if (state?.failed !== true) {
    return null;
  }

  const line = `Could not read ${subject}.`;

  if (state.goodAt === null) {
    return line;
  }

  return `${line} Last read ${lastRead(state.goodAt, now)}.`;
};
