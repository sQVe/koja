export interface CommandTitle {
  command: string;
  args: Record<string, unknown>;
  title: string;
}

const paneDirections = ['left', 'right', 'up', 'down'];

export const commandIdentity = (command: string, args: Record<string, unknown> = {}): string =>
  `${command}:${JSON.stringify(args)}`;

export const focusPaneTitles: CommandTitle[] = paneDirections.map((direction) => ({
  command: 'pane.go',
  args: { direction },
  title: `Focus pane ${direction}`,
}));

export const swapPaneTitles: CommandTitle[] = paneDirections.map((direction) => ({
  command: 'pane.swap',
  args: { direction },
  title: `Swap pane ${direction}`,
}));

export const commandTitles = {
  newTab: { command: 'tab.new', args: {}, title: 'New tab' },
  openPicker: { command: 'mod.open', args: { name: 'koja-picker' }, title: 'Go to space or tab…' },
  renameTab: { command: 'tab.rename', args: {}, title: 'Rename tab' },
  closeTab: { command: 'tab.close', args: {}, title: 'Close tab' },
  nextTab: { command: 'tab.next', args: {}, title: 'Next tab' },
  previousTab: { command: 'tab.prev', args: {}, title: 'Previous tab' },
  splitRight: {
    command: 'pane.split',
    args: { direction: 'right' },
    title: 'Split right',
  },
  splitDown: {
    command: 'pane.split',
    args: { direction: 'down' },
    title: 'Split down',
  },
  closePane: { command: 'pane.close', args: {}, title: 'Close pane' },
  zoomPane: { command: 'pane.zoom', args: {}, title: 'Zoom pane' },
  newSpace: { command: 'space.new', args: {}, title: 'New space' },
  renameSpace: { command: 'space.rename', args: {}, title: 'Rename space' },
  closeSpace: { command: 'space.close', args: {}, title: 'Close space' },
  nextSpace: { command: 'space.next', args: {}, title: 'Next space' },
  previousSpace: { command: 'space.prev', args: {}, title: 'Previous space' },
  nextLayout: { command: 'layout.switch', args: {}, title: 'Next layout' },
  zoomIn: { command: 'app.zoom_in', args: {}, title: 'Zoom in' },
  zoomOut: { command: 'app.zoom_out', args: {}, title: 'Zoom out' },
  resetZoom: { command: 'app.zoom_reset', args: {}, title: 'Reset zoom' },
} satisfies Record<string, CommandTitle>;
