import type { SpaceCommand, SpaceOrder } from '../spaceOrder.ts';
import { closedSpaceCommand } from '../spaceOrder.ts';
import type { SpaceSelection } from './spaceSelection.ts';
import { selectionMoved } from './spaceSelection.ts';

export interface PendingPick {
  id: string;
  seenAt: number;
}

export interface CloseWatch {
  focused: string | null;
  order: SpaceOrder | null;
  selection: SpaceSelection | null;
  pending: PendingPick | null;
}

export interface CloseLook {
  focused: string | null;
  order: SpaceOrder | null;
  selection: SpaceSelection | null;
  liveIds: readonly string[];
  now: number;
}

export interface CloseFollowStep {
  watch: CloseWatch;
  command: SpaceCommand | null;
}

const pickLandMilliseconds = 1000;

const stillPending = (pending: PendingPick | null, look: CloseLook): PendingPick | null => {
  if (pending === null) {
    return null;
  }

  const closed = !look.liveIds.includes(pending.id);
  const expired = look.now - pending.seenAt >= pickLandMilliseconds;

  if (closed || expired) {
    return null;
  }

  return pending;
};

const pickStarted = (look: CloseLook): PendingPick | null => {
  const id = look.selection?.id ?? null;

  if (id === null || id === look.focused) {
    return null;
  }

  return { id, seenAt: look.now };
};

const pickCarried = (pending: PendingPick | null, look: CloseLook): PendingPick | null => {
  const still = stillPending(pending, look);

  if (still === null || look.focused === still.id) {
    return null;
  }

  return still;
};

const pickBlocks = (
  pending: PendingPick | null,
  look: CloseLook,
  closedId: string | null,
): boolean => {
  const still = stillPending(pending, look);

  return still !== null && still.id !== closedId;
};

// The rules, in the order they decide a look:
// - A pick is pending until focus lands on it. A record whose count changed since the last look
//   starts one; it clears when focus lands on its space, when that space closes, when a newer
//   record replaces it, or after pickLandMilliseconds.
// - A close seen while a pick is pending is not followed, and is dropped rather than delayed.
//   Focus landing on the pick in that look still counts as pending, because the close was seen
//   while it was.
// - A record naming the closed space does not block the follow.
export const closeFollowStep = (watch: CloseWatch, look: CloseLook): CloseFollowStep => {
  const command = closedSpaceCommand({
    closedId: watch.focused,
    order: watch.order,
    liveIds: look.liveIds,
  });

  const moved = selectionMoved(watch.selection, look.selection, watch.focused, look.liveIds);
  const pending = moved ? pickStarted(look) : pickCarried(watch.pending, look);
  const blocked = moved || pickBlocks(watch.pending, look, watch.focused);

  return {
    watch: {
      focused: look.focused,
      order: look.order,
      selection: look.selection,
      pending,
    },
    command: command !== null && !blocked ? command : null,
  };
};
