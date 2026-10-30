import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';

type SplitDirection = Extract<ControlMessage, { type: 'paneSplit' }>['direction'];

export type PaneMoveDestination = Extract<ControlMessage, { type: 'paneMove' }>['destination'];

type ResizeDirection = Extract<ControlMessage, { type: 'paneResize' }>['direction'];

type RotateDirection = Extract<ControlMessage, { type: 'paneRotate' }>['direction'];

export type PaneLayoutCommand =
  | { action: 'split'; pane: PaneId; direction: SplitDirection; cwd: string | undefined }
  | { action: 'add'; pane: PaneId; cwd: string | undefined }
  | { action: 'focus'; pane: PaneId }
  | { action: 'focusDirection'; pane: PaneId; direction: ResizeDirection }
  | { action: 'rotate'; pane: PaneId; direction: RotateDirection }
  | { action: 'close'; pane: PaneId }
  | { action: 'move'; pane: PaneId; destination: PaneMoveDestination }
  | { action: 'zoom'; pane: PaneId }
  | { action: 'resize'; pane: PaneId; direction: ResizeDirection; cells: number };

export const paneLayoutRequest = (command: PaneLayoutCommand): ControlMessage => {
  if (command.action === 'split') {
    return {
      type: 'paneSplit',
      paneId: command.pane,
      direction: command.direction,
      cwd: command.cwd,
    };
  }

  if (command.action === 'add') {
    return { type: 'paneAdd', paneId: command.pane, cwd: command.cwd };
  }

  if (command.action === 'resize') {
    return {
      type: 'paneResize',
      paneId: command.pane,
      direction: command.direction,
      cells: command.cells,
    };
  }

  if (command.action === 'rotate') {
    return { type: 'paneRotate', paneId: command.pane, direction: command.direction };
  }

  if (command.action === 'focusDirection') {
    return { type: 'paneFocusDirection', paneId: command.pane, direction: command.direction };
  }

  if (command.action === 'move') {
    return { type: 'paneMove', paneId: command.pane, destination: command.destination };
  }

  if (command.action === 'zoom') {
    return { type: 'paneZoom', paneId: command.pane };
  }

  return command.action === 'focus'
    ? { type: 'paneFocus', paneId: command.pane }
    : { type: 'paneClose', paneId: command.pane };
};
