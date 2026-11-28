import { isRecord } from '../kit/fields.ts';

const compareKeys = <Value>([first]: [string, Value], [second]: [string, Value]): number => {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
};

// Records with the same keys and values give the same JSON text, whatever their insertion order.
// The order is not lexicographic: the engine lists integer-like keys first, in numeric order.
export const sortedValue = (value: unknown): unknown => {
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
