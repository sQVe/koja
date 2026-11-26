export const isPositiveWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const withoutTrailingSlashes = (path: string): string => path.replace(/\/+$/, '');

export const folderNameOf = (path: string | null): string =>
  (path ?? '').split('/').findLast((part) => part !== '') ?? '';

export const sameItems = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

export const keepEarliest = (stored: Map<string, number>, key: string, at: number): void => {
  const first = stored.get(key);

  if (first !== undefined && first <= at) {
    return;
  }

  stored.set(key, at);
};
