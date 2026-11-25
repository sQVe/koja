export const isPositiveWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const folderNameOf = (path: string): string =>
  path.split('/').findLast((part) => part !== '') ?? path;
