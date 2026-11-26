export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compareKeys = <Value>([first]: [string, Value], [second]: [string, Value]): number => {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
};

export const sortRecordKeys = <Value>(record: Record<string, Value>): Record<string, Value> => {
  const entries = Object.entries(record).toSorted(compareKeys);

  return Object.fromEntries(entries);
};

export const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

export const hasOnlyKeys = (fields: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(fields).length === keys.length && keys.every((key) => Object.hasOwn(fields, key));

export const stringOf = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const stringListOf = (value: unknown): string[] =>
  listOf(value).filter((entry): entry is string => typeof entry === 'string');

export const numberOf = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;
