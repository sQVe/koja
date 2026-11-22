import { isRecord } from '../kit/fields.ts';

const compareKeys = ([first]: [string, unknown], [second]: [string, unknown]): number => {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
};

const sortedValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries: [string, unknown][] = Object.entries(value)
    .toSorted(compareKeys)
    .map(([key, entry]) => [key, sortedValue(entry)]);

  return Object.fromEntries(entries);
};

export const sameValue = (first: unknown, second: unknown): boolean =>
  JSON.stringify(sortedValue(first)) === JSON.stringify(sortedValue(second));
