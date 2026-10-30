import type { InputMode } from './clientAttach.ts';
import { viewedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

const removedViewedPane = (before: StoreSnapshot, after: StoreSnapshot): boolean => {
  const viewed = viewedPane(before);

  return viewed !== undefined && !after.panes.some((pane) => pane.id === viewed.id);
};

// Only the pane the client viewed can end insert mode. A focus change keeps the old pane in the
// snapshot, so it does not count as a removal. The first snapshot has no earlier pane, so an empty
// workspace is the only reason to leave insert mode there.
export const inputModeAfter = (
  mode: InputMode,
  before: StoreSnapshot | undefined,
  after: StoreSnapshot,
): InputMode => {
  const left =
    before === undefined ? viewedPane(after) === undefined : removedViewedPane(before, after);

  return left ? 'normal' : mode;
};
