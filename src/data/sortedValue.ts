import { isRecord, sortRecordKeys } from '../kit/fields.ts';

const sortedValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries: [string, unknown][] = Object.entries(sortRecordKeys(value)).map(([key, entry]) => [
    key,
    sortedValue(entry),
  ]);

  return Object.fromEntries(entries);
};

export const sameValue = (first: unknown, second: unknown): boolean =>
  JSON.stringify(sortedValue(first)) === JSON.stringify(sortedValue(second));
