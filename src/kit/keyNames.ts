import type { NormalAction, NormalIntent, SectionTarget } from './normalKeys.ts';
import type { ListAction } from './section.ts';

interface CommandName {
  command: string;
  args?: Record<string, unknown>;
  name: string;
}

const intentNames: Record<NormalIntent, string> = {
  closeOtherPanes: 'Close other panes',
  nextPane: 'Next pane',
  previousPane: 'Previous pane',
  lastPane: 'Last pane',
  lastTab: 'Last tab',
};

const sectionNames: Record<SectionTarget, string> = {
  next: 'Next section',
  previous: 'Previous section',
  panes: 'Back to panes',
};

const listNames: Record<ListAction, string> = {
  down: 'Down',
  up: 'Up',
  first: 'First item',
  last: 'Last item',
  halfPageDown: 'Half page down',
  halfPageUp: 'Half page up',
  open: 'Open',
};

const directions = ['left', 'down', 'up', 'right'];

const tabName = (index: number): string => `Go to tab ${index}`;

const commandNames: CommandName[] = [
  ...directions.map((direction) => ({
    command: 'pane.go',
    args: { direction },
    name: `Focus pane ${direction}`,
  })),
  ...directions.map((direction) => ({
    command: 'pane.swap',
    args: { direction },
    name: `Swap pane ${direction}`,
  })),
  { command: 'pane.split', args: { direction: 'down' }, name: 'Split down' },
  { command: 'pane.split', args: { direction: 'right' }, name: 'Split right' },
  { command: 'pane.close', name: 'Close pane' },
  { command: 'pane.zoom', name: 'Zoom pane' },
  { command: 'tab.new', name: 'New tab' },
  { command: 'tab.close', name: 'Close tab' },
  { command: 'tab.rename', name: 'Rename tab' },
  { command: 'tab.prev', name: 'Previous tab' },
  { command: 'tab.next', name: 'Next tab' },
  { command: 'space.new', name: 'New space' },
  { command: 'space.close', name: 'Close space' },
  { command: 'space.rename', name: 'Rename space' },
  { command: 'space.next', name: 'Next space' },
  { command: 'space.prev', name: 'Previous space' },
  { command: 'mod.open', args: { name: 'koja-picker' }, name: 'Go to space or tab…' },
  { command: 'mod.open', args: { name: 'koja-palette' }, name: 'Command palette' },
  { command: 'layout.toggle', args: { id: 'sidebar' }, name: 'Toggle sidebar' },
  { command: 'layout.switch', name: 'Next layout' },
  { command: 'app.zoom_in', name: 'Zoom in' },
  { command: 'app.zoom_out', name: 'Zoom out' },
  { command: 'app.zoom_reset', name: 'Reset zoom' },
  { command: 'terminal.scroll', args: { pages: -0.5 }, name: 'Scroll half page up' },
  { command: 'terminal.scroll', args: { pages: 0.5 }, name: 'Scroll half page down' },
  { command: 'terminal.scroll', args: { pages: -1 }, name: 'Scroll page up' },
  { command: 'terminal.scroll', args: { pages: 1 }, name: 'Scroll page down' },
  { command: 'terminal.scroll', args: { lines: -1 }, name: 'Scroll line up' },
  { command: 'terminal.scroll', args: { lines: 1 }, name: 'Scroll line down' },
  { command: 'terminal.scroll', args: { to: 'top' }, name: 'Scroll to top' },
  { command: 'terminal.scroll', args: { to: 'bottom' }, name: 'Scroll to bottom' },
  { command: 'terminal.search', name: 'Search terminal' },
  { command: 'mod.open', args: { name: 'koja-help' }, name: 'Keys' },
];

const commandKey = (command: string, args: Record<string, unknown> = {}): string =>
  `${command}:${JSON.stringify(args)}`;

const namesByCommand = new Map(
  commandNames.map(({ command, args, name }) => [commandKey(command, args), name]),
);

const commandName = (command: string, args?: Record<string, unknown>): string | undefined => {
  const index = args?.['index'];

  if (command === 'tab.select' && typeof index === 'number') {
    return tabName(index);
  }

  return namesByCommand.get(commandKey(command, args));
};

export const actionName = (action: NormalAction): string | undefined => {
  switch (action.kind) {
    case 'command': {
      return commandName(action.command, action.args);
    }

    case 'intent': {
      return intentNames[action.intent];
    }

    case 'nthTab': {
      return tabName(action.index);
    }

    case 'section': {
      return sectionNames[action.target];
    }

    case 'list': {
      return listNames[action.action];
    }

    case 'leave': {
      return 'Leave normal mode';
    }

    default: {
      return action satisfies never;
    }
  }
};
