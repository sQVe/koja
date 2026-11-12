import type { CommandTitle } from './commandTitles.ts';
import {
  commandIdentity,
  commandTitles,
  focusPaneTitles,
  swapPaneTitles,
} from './commandTitles.ts';
import type { NormalAction, NormalIntent, SectionTarget } from './normalKeys.ts';
import type { ListAction } from './section.ts';

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

const tabName = (index: number): string => `Go to tab ${index}`;

const helpOnlyTitles: CommandTitle[] = [
  { command: 'mod.open', args: { name: 'koja-palette' }, title: 'Command palette' },
  { command: 'layout.toggle', args: { id: 'sidebar' }, title: 'Toggle sidebar' },
  { command: 'terminal.scroll', args: { pages: -0.5 }, title: 'Scroll half page up' },
  { command: 'terminal.scroll', args: { pages: 0.5 }, title: 'Scroll half page down' },
  { command: 'terminal.scroll', args: { pages: -1 }, title: 'Scroll page up' },
  { command: 'terminal.scroll', args: { pages: 1 }, title: 'Scroll page down' },
  { command: 'terminal.scroll', args: { lines: -1 }, title: 'Scroll line up' },
  { command: 'terminal.scroll', args: { lines: 1 }, title: 'Scroll line down' },
  { command: 'terminal.scroll', args: { to: 'top' }, title: 'Scroll to top' },
  { command: 'terminal.scroll', args: { to: 'bottom' }, title: 'Scroll to bottom' },
  { command: 'terminal.search', args: {}, title: 'Search terminal' },
  { command: 'mod.open', args: { name: 'koja-help' }, title: 'Keys' },
];

const allTitles = [
  ...Object.values(commandTitles),
  ...focusPaneTitles,
  ...swapPaneTitles,
  ...helpOnlyTitles,
];

const namesByCommand = new Map(
  allTitles.map(({ command, args, title }) => [commandIdentity(command, args), title]),
);

const commandName = (command: string, args?: Record<string, unknown>): string | undefined => {
  const index = args?.['index'];

  if (command === 'tab.select' && typeof index === 'number') {
    return tabName(index);
  }

  return namesByCommand.get(commandIdentity(command, args));
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
