import { shortAge } from '../../kit/age.ts';
import type { ListedSpace } from './tree.ts';

const millisecondsPerSecond = 1000;

export const labelDetail = (main: ListedSpace): string | undefined => {
  const parts: string[] = [];
  const branch = main.git?.branch;
  const committedAt = main.git?.committedAt;

  if (typeof branch === 'string') {
    parts.push(branch);
  }

  if (typeof committedAt === 'number') {
    parts.push(shortAge(committedAt, Math.floor(Date.now() / millisecondsPerSecond)));
  }

  return parts.length === 0 ? undefined : parts.join(' · ');
};
