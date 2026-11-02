import type { DragState, DropAction } from '../../kit/drag.ts';
import { dropAction, setDragOver } from '../../kit/drag.ts';

export const tabDropAction = (
  drag: DragState,
  releasedId: string,
  liveIds: readonly string[],
): DropAction => {
  const released = setDragOver(drag, releasedId, true);

  return dropAction(released, releasedId, liveIds) ?? { kind: 'select', id: releasedId };
};
