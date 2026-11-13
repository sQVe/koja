import type { Pull } from './pulls.ts';

export type RowCut = 'middle' | 'end';

export const rowCut = (named: boolean, pull: Pull | null): RowCut => {
  const showsPullTitle = !named && pull !== null && pull.title !== '';

  return showsPullTitle ? 'end' : 'middle';
};
