import type { WorkspaceId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';

export type WorkspaceCommand =
  | { action: 'create'; root: string; label: string | undefined; background: boolean }
  | { action: 'focus'; workspaceId: WorkspaceId }
  | { action: 'rename'; workspaceId: WorkspaceId; label: string }
  | { action: 'close'; workspaceId: WorkspaceId };

export const workspaceRequest = (command: WorkspaceCommand): ControlMessage => {
  if (command.action === 'create') {
    return {
      type: 'workspaceCreate',
      root: command.root,
      label: command.label,
      background: command.background,
    };
  }

  if (command.action === 'rename') {
    return { type: 'workspaceRename', workspaceId: command.workspaceId, label: command.label };
  }

  return command.action === 'focus'
    ? { type: 'workspaceFocus', workspaceId: command.workspaceId }
    : { type: 'workspaceClose', workspaceId: command.workspaceId };
};
