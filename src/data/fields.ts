export const isPositiveWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const folderNameOf = (path: string | null): string =>
  (path ?? '').split('/').findLast((part) => part !== '') ?? '';

export const sameItems = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);
