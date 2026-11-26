import { setShared, shared } from 'herdr';

import { modName, stringOf } from '../../kit/index.ts';

const selectionKey = `${modName}.selection`;

export const readSelection = (): string | null => stringOf(shared(selectionKey));

// Only a changed pane is published, so arrowing within one pane does not re-render every mod.
export const writeSelection = (pane: string | null): void => {
  if (readSelection() === pane) {
    return;
  }

  setShared(selectionKey, pane);
};
