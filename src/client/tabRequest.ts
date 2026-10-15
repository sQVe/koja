import type { TabId, WorkspaceId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';

export type TabCommand =
  | { action: 'create'; workspaceId: WorkspaceId; cwd: string | undefined; focus: boolean }
  | { action: 'focus'; tabId: TabId }
  | { action: 'close'; tabId: TabId };

export const tabRequest = (command: TabCommand): ControlMessage => {
  if (command.action === 'create') {
    return {
      type: 'tabCreate',
      workspaceId: command.workspaceId,
      cwd: command.cwd,
      focus: command.focus,
    };
  }

  return command.action === 'focus'
    ? { type: 'tabFocus', tabId: command.tabId }
    : { type: 'tabClose', tabId: command.tabId };
};
