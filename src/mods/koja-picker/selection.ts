import { setShared, shared } from 'herdr';

import { modName, stringOf } from '../../kit/index.ts';

// One key per popup, so a second Go to cannot move the header of the first, and a closed popup
// leaves nothing behind that another one would read.
const selectionKey = (overlay: string | null): string =>
  overlay === null ? `${modName}.selection` : `${modName}.selection.${overlay}`;

export const readSelection = (overlay: string | null): string | null =>
  stringOf(shared(selectionKey(overlay)));

// Only a changed pane is published, so arrowing within one pane does not re-render every mod.
export const writeSelection = (overlay: string | null, pane: string | null): void => {
  if (readSelection(overlay) === pane) {
    return;
  }

  setShared(selectionKey(overlay), pane);
};
