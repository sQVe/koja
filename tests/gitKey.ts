export const keyOf = (machine: string | null, path: string): string =>
  JSON.stringify([machine, path]);
