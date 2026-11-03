export const showsSelectionHint = (open: string | null, fileCount: number): boolean =>
  open === null && fileCount > 0;
