import type { PaneReadSource } from '../client/client.ts';

export interface RawReadOptions {
  source: string | undefined;
  lines: string | undefined;
  from: string | undefined;
  to: string | undefined;
}

export interface ReadOptions {
  source: PaneReadSource;
  lines: number | undefined;
  range: { from: number; to: number } | undefined;
}

// herdr clamps an explicit line count to this.
const largestLines = 1000;

const sources = new Map<string, PaneReadSource>([
  ['visible', 'visible'],
  ['recent', 'recent'],
  ['recent-unwrapped', 'recentUnwrapped'],
  ['recent_unwrapped', 'recentUnwrapped'],
]);

const parseWhole = (value: string): number | undefined => {
  const number = Number(value);

  return /^[0-9]+$/.test(value) && Number.isSafeInteger(number) ? number : undefined;
};

const parseRange = (
  from: string | undefined,
  to: string | undefined,
): { from: number; to: number } | string | undefined => {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  if (from === undefined || to === undefined) {
    return '--from and --to come together.';
  }

  const first = parseWhole(from);
  const last = parseWhole(to);

  if (first === undefined || last === undefined) {
    return '--from and --to take whole row numbers of 0 or more.';
  }

  return first > last ? '--from cannot be greater than --to.' : { from: first, to: last };
};

const parseLines = (value: string | undefined): number | undefined | string => {
  if (value === undefined) {
    return undefined;
  }

  const lines = parseWhole(value);

  return lines === undefined
    ? '--lines takes a whole number of 0 or more.'
    : Math.min(lines, largestLines);
};

export const parseReadOptions = (raw: RawReadOptions): ReadOptions | string => {
  const source = raw.source === undefined ? 'recent' : sources.get(raw.source);

  if (source === undefined) {
    return `'${raw.source}' is not a source. Use visible, recent, or recent-unwrapped.`;
  }

  const lines = parseLines(raw.lines);

  if (typeof lines === 'string') {
    return lines;
  }

  const range = parseRange(raw.from, raw.to);

  if (typeof range === 'string') {
    return range;
  }

  if (range !== undefined && lines !== undefined) {
    return '--from and --to cannot be combined with --lines.';
  }

  if (range !== undefined && source === 'visible') {
    return '--from and --to cannot be combined with --source visible.';
  }

  return { source, lines, range };
};
