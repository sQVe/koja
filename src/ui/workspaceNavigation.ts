import { workspaceNeighborOf } from '../actions.ts';
import type { WorkspaceKey } from '../actions.ts';
import type { WorkspaceCommand, WorkspaceReply } from '../client/client.ts';
import type { WorkspaceId } from '../ids.ts';

interface WorkspaceNavigationHost {
  workspaces: () => { ids: readonly WorkspaceId[]; focused: WorkspaceId | undefined };
  startDirectory: string;
  command: (command: WorkspaceCommand, onReply: (reply: WorkspaceReply) => void) => void;
}

interface WorkspaceNavigation {
  runKey: (key: WorkspaceKey) => void;
  // Focuses the clicked workspace unless it is already the one shown.
  focusByClick: (workspaceId: WorkspaceId) => void;
  pending: () => boolean;
  // Set by a click focus until the server answers. Every later token waits, so it reaches the new
  // pane.
  clickFocusing: () => boolean;
  // Runs the callback once, when no workspace request is pending.
  afterSettled: (callback: () => void) => void;
}

const neighborCommand = (
  ids: readonly WorkspaceId[],
  focused: WorkspaceId,
  step: 1 | -1,
): WorkspaceCommand | undefined => {
  const target = workspaceNeighborOf(ids, focused, step);

  if (target === undefined) {
    return undefined;
  }

  return { action: 'focus', workspaceId: target };
};

export const createWorkspaceNavigation = (host: WorkspaceNavigationHost): WorkspaceNavigation => {
  // The focus the last j or k asked for, kept until the server answers the latest focus request.
  let pendingFocus: WorkspaceId | undefined;
  let focusRequests = 0;
  // After c or X the resulting focus is unknown until the server answers.
  let awaitingResult = false;
  let clickFocusing = false;
  let waiters: (() => void)[] = [];

  const pending = (): boolean => focusRequests > 0 || awaitingResult;

  const notifyWaiters = (): void => {
    if (pending()) {
      return;
    }

    clickFocusing = false;

    const released = waiters;

    waiters = [];

    for (const waiter of released) {
      waiter();
    }
  };

  const settleFocus = (): void => {
    focusRequests -= 1;

    if (focusRequests === 0) {
      pendingFocus = undefined;
    }

    notifyWaiters();
  };

  const commandOf = (key: WorkspaceKey): WorkspaceCommand | undefined => {
    if (awaitingResult) {
      return undefined;
    }

    const current = host.workspaces();
    const stillListed = current.ids.some((id) => id === pendingFocus);
    const focused = stillListed ? pendingFocus : current.focused;

    if (key === 'create') {
      return { action: 'create', root: host.startDirectory, label: undefined, focus: true };
    }

    if (focused === undefined) {
      return undefined;
    }

    if (key === 'close') {
      return { action: 'close', workspaceId: focused };
    }

    return neighborCommand(current.ids, focused, key === 'next' ? 1 : -1);
  };

  const focus = (workspaceId: WorkspaceId): void => {
    pendingFocus = workspaceId;
    focusRequests += 1;
    host.command({ action: 'focus', workspaceId }, settleFocus);
  };

  const runKey = (key: WorkspaceKey): void => {
    const command = commandOf(key);

    if (command === undefined) {
      return;
    }

    if (command.action === 'focus') {
      focus(command.workspaceId);

      return;
    }

    awaitingResult = true;

    host.command(command, () => {
      awaitingResult = false;
      notifyWaiters();
    });
  };

  const focusByClick = (workspaceId: WorkspaceId): void => {
    const shown = pendingFocus ?? host.workspaces().focused;

    if (workspaceId === shown) {
      return;
    }

    clickFocusing = true;
    focus(workspaceId);
  };

  return {
    runKey,
    focusByClick,
    pending,
    clickFocusing: () => clickFocusing,
    afterSettled: (callback) => {
      waiters.push(callback);
    },
  };
};
