import type { SpaceStack } from '../../data/spaceStack.ts';

export const stackProgressOf = (
  stack: SpaceStack | null,
): { merged: number; total: number } | null => {
  if (stack === null || stack.total < 2) {
    return null;
  }

  return { merged: stack.merged, total: stack.total };
};
