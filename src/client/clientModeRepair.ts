import type { InputMode } from './clientAttach.ts';
import { viewedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

const removedViewedPane = (before: StoreSnapshot, after: StoreSnapshot): boolean => {
  const viewed = viewedPane(before);

  return viewed !== undefined && !after.panes.some((pane) => pane.id === viewed.id);
};

export const inputModeAfter = (
  mode: InputMode,
  before: StoreSnapshot | undefined,
  after: StoreSnapshot,
): InputMode => {
  const left =
    before === undefined ? viewedPane(after) === undefined : removedViewedPane(before, after);

  return left ? 'normal' : mode;
};
