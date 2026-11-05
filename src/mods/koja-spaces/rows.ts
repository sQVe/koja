import { shortAge } from '../../kit/age.ts';
import type { Pull } from './pulls.ts';
import type { ListedSpace } from './tree.ts';

export interface LabelDetail {
  branch?: string;
  age?: string;
}

export type RowCut = 'middle' | 'end';

const millisecondsPerSecond = 1000;

export const labelDetail = (main: ListedSpace): LabelDetail => {
  const branch = main.git?.branch;
  const committedAt = main.git?.committedAt;
  const detail: LabelDetail = {};

  if (typeof branch === 'string') {
    detail.branch = branch;
  }

  if (typeof committedAt === 'number') {
    detail.age = shortAge(committedAt, Math.floor(Date.now() / millisecondsPerSecond));
  }

  return detail;
};

export const rowCut = (named: boolean, pull: Pull | null): RowCut => {
  const showsPullTitle = !named && pull !== null && pull.title !== '';

  return showsPullTitle ? 'end' : 'middle';
};
