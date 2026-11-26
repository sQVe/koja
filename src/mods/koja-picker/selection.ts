import { setShared, shared } from 'herdr';

import { modName, stringOf } from '../../kit/index.ts';

// One key per popup, so a second Go to cannot move the header of the first.
const selectionKey = (overlay: string): string => `${modName}.selection.${overlay}`;

export const readSelection = (overlay: string): string | null =>
  stringOf(shared(selectionKey(overlay)));

// Only a changed pane is published, so arrowing within one pane does not re-render every mod.
export const writeSelection = (overlay: string, pane: string | null): void => {
  if (readSelection(overlay) === pane) {
    return;
  }

  setShared(selectionKey(overlay), pane);
};

// A closed popup leaves nothing behind for the next one to read.
export const clearSelection = (overlay: string): void => {
  if (readSelection(overlay) === null) {
    return;
  }

  setShared(selectionKey(overlay), null);
};
