import type { ListAction } from './section.ts';

export type NormalIntent =
  | 'closeOtherPanes'
  | 'nextPane'
  | 'previousPane'
  | 'lastPane'
  | 'lastTab'
  | 'nextNeedsYou'
  | 'previousNeedsYou'
  | 'nextRoot'
  | 'previousRoot';

export type SectionTarget = 'next' | 'previous' | 'panes';

export type NormalAction =
  | { kind: 'command'; command: string; args?: Record<string, unknown> }
  | { kind: 'intent'; intent: NormalIntent }
  | { kind: 'nthTab'; index: number }
  | { kind: 'section'; target: SectionTarget }
  | { kind: 'list'; action: ListAction }
  | { kind: 'leave' };

export interface NormalKey {
  keys: string[];
  action: NormalAction;
  counted?: 'nthTab';
}

interface WindowKey {
  key: string;
  action: NormalAction;
  controlTwin?: boolean;
}

const herdrCommand = (command: string, args?: Record<string, unknown>): NormalAction => ({
  kind: 'command',
  command,
  ...(args === undefined ? {} : { args }),
});

const intentAction = (intent: NormalIntent): NormalAction => ({ kind: 'intent', intent });

const sectionAction = (target: SectionTarget): NormalAction => ({ kind: 'section', target });

const listAction = (action: ListAction): NormalAction => ({ kind: 'list', action });

const leaveAction: NormalAction = { kind: 'leave' };

const windowKeys: WindowKey[] = [
  { key: 'h', action: herdrCommand('pane.go', { direction: 'left' }), controlTwin: true },
  { key: 'j', action: herdrCommand('pane.go', { direction: 'down' }), controlTwin: true },
  { key: 'k', action: herdrCommand('pane.go', { direction: 'up' }), controlTwin: true },
  { key: 'l', action: herdrCommand('pane.go', { direction: 'right' }), controlTwin: true },
  { key: 'left', action: herdrCommand('pane.go', { direction: 'left' }) },
  { key: 'down', action: herdrCommand('pane.go', { direction: 'down' }) },
  { key: 'up', action: herdrCommand('pane.go', { direction: 'up' }) },
  { key: 'right', action: herdrCommand('pane.go', { direction: 'right' }) },
  { key: 'H', action: herdrCommand('pane.swap', { direction: 'left' }) },
  { key: 'J', action: herdrCommand('pane.swap', { direction: 'down' }) },
  { key: 'K', action: herdrCommand('pane.swap', { direction: 'up' }) },
  { key: 'L', action: herdrCommand('pane.swap', { direction: 'right' }) },
  { key: 's', action: herdrCommand('pane.split', { direction: 'down' }), controlTwin: true },
  { key: 'n', action: herdrCommand('pane.split', { direction: 'down' }), controlTwin: true },
  { key: 'v', action: herdrCommand('pane.split', { direction: 'right' }), controlTwin: true },
  { key: 'q', action: herdrCommand('pane.close'), controlTwin: true },
  { key: 'c', action: herdrCommand('pane.close') },
  { key: 'o', action: intentAction('closeOtherPanes'), controlTwin: true },
  { key: 'm', action: herdrCommand('pane.zoom') },
  { key: '_', action: herdrCommand('pane.zoom'), controlTwin: true },
  { key: '|', action: herdrCommand('pane.zoom') },
  { key: 'w', action: intentAction('nextPane'), controlTwin: true },
  { key: 'W', action: intentAction('previousPane') },
  { key: 'p', action: intentAction('lastPane'), controlTwin: true },
];

const windowEntry = ({ key, action }: WindowKey): NormalKey => ({ keys: ['w', key], action });

const controlWindowEntries = ({ key, action, controlTwin }: WindowKey): NormalKey[] => {
  const alias = { keys: ['ctrl-w', key], action };

  if (controlTwin !== true) {
    return [alias];
  }

  return [alias, { keys: ['ctrl-w', `ctrl-${key}`], action }];
};

const tabDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const tabSelectEntry = (digit: string): NormalKey => ({
  keys: ['t', digit],
  action: herdrCommand('tab.select', { index: Number(digit) }),
});

const paletteAction = herdrCommand('mod.open', { name: 'koja-palette' });

const pickerAction = herdrCommand('mod.open', { name: 'koja-picker' });

export const normalKeys: NormalKey[] = [
  { keys: ['h'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['j'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['k'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['l'], action: herdrCommand('pane.go', { direction: 'right' }) },
  { keys: ['H'], action: herdrCommand('pane.swap', { direction: 'left' }) },
  { keys: ['J'], action: herdrCommand('pane.swap', { direction: 'down' }) },
  { keys: ['K'], action: herdrCommand('pane.swap', { direction: 'up' }) },
  { keys: ['L'], action: herdrCommand('pane.swap', { direction: 'right' }) },
  { keys: ['ctrl-h'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['ctrl-j'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['ctrl-k'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['ctrl-l'], action: herdrCommand('pane.go', { direction: 'right' }) },
  { keys: ['left'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['down'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['up'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['right'], action: herdrCommand('pane.go', { direction: 'right' }) },
  { keys: ['ctrl-left'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['ctrl-down'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['ctrl-up'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['ctrl-right'], action: herdrCommand('pane.go', { direction: 'right' }) },
  ...windowKeys.map(windowEntry),
  ...windowKeys.flatMap(controlWindowEntries),
  { keys: ['t', 'n'], action: herdrCommand('tab.new') },
  { keys: ['t', 'q'], action: herdrCommand('tab.close') },
  { keys: ['t', 'r'], action: herdrCommand('tab.rename') },
  { keys: ['t', 'h'], action: herdrCommand('tab.prev') },
  { keys: ['t', 'l'], action: herdrCommand('tab.next') },
  ...tabDigits.map(tabSelectEntry),
  { keys: ['g', 't'], action: herdrCommand('tab.next'), counted: 'nthTab' },
  { keys: ['g', 'T'], action: herdrCommand('tab.prev') },
  { keys: [')'], action: herdrCommand('tab.next') },
  { keys: ['('], action: herdrCommand('tab.prev') },
  { keys: ['g', 'tab'], action: intentAction('lastTab') },
  { keys: ['g', 'a'], action: intentAction('nextNeedsYou') },
  { keys: ['g', 'A'], action: intentAction('previousNeedsYou') },
  { keys: ['space'], action: intentAction('nextNeedsYou') },
  { keys: ['s', 'n'], action: herdrCommand('space.new') },
  { keys: ['s', 'q'], action: herdrCommand('space.close') },
  { keys: ['s', 'r'], action: herdrCommand('space.rename') },
  { keys: ['s', 'j'], action: herdrCommand('space.next') },
  { keys: ['s', 'k'], action: herdrCommand('space.prev') },
  { keys: [']'], action: herdrCommand('space.next') },
  { keys: ['['], action: herdrCommand('space.prev') },
  { keys: ['}'], action: intentAction('nextRoot') },
  { keys: ['{'], action: intentAction('previousRoot') },
  { keys: ['s', 'f'], action: pickerAction },
  { keys: ['tab'], action: sectionAction('next') },
  { keys: ['shift-tab'], action: sectionAction('previous') },
  { keys: ['escape'], action: sectionAction('panes') },
  { keys: ['z', 's'], action: herdrCommand('layout.toggle', { id: 'sidebar' }) },
  { keys: ['z', 'l'], action: herdrCommand('layout.switch') },
  { keys: ['z', '+'], action: herdrCommand('app.zoom_in') },
  { keys: ['z', '-'], action: herdrCommand('app.zoom_out') },
  { keys: ['z', '0'], action: herdrCommand('app.zoom_reset') },
  { keys: ['ctrl-u'], action: herdrCommand('terminal.scroll', { pages: -0.5 }) },
  { keys: ['ctrl-d'], action: herdrCommand('terminal.scroll', { pages: 0.5 }) },
  { keys: ['ctrl-b'], action: herdrCommand('terminal.scroll', { pages: -1 }) },
  { keys: ['ctrl-f'], action: herdrCommand('terminal.scroll', { pages: 1 }) },
  { keys: ['ctrl-y'], action: herdrCommand('terminal.scroll', { lines: -1 }) },
  { keys: ['ctrl-e'], action: herdrCommand('terminal.scroll', { lines: 1 }) },
  { keys: ['g', 'g'], action: herdrCommand('terminal.scroll', { to: 'top' }) },
  { keys: ['G'], action: herdrCommand('terminal.scroll', { to: 'bottom' }) },
  { keys: [':'], action: paletteAction },
  { keys: ['backspace'], action: paletteAction },
  { keys: ['ö'], action: paletteAction },
  { keys: ['/'], action: herdrCommand('terminal.search') },
  { keys: ['?'], action: herdrCommand('app.help') },
  { keys: ['ä'], action: pickerAction },
  { keys: ['i'], action: leaveAction },
  { keys: ['a'], action: leaveAction },
  { keys: ['enter'], action: leaveAction },
];

export const listKeys: NormalKey[] = [
  { keys: ['j'], action: listAction('down') },
  { keys: ['k'], action: listAction('up') },
  { keys: ['g', 'g'], action: listAction('first') },
  { keys: ['G'], action: listAction('last') },
  { keys: ['ctrl-d'], action: listAction('halfPageDown') },
  { keys: ['ctrl-u'], action: listAction('halfPageUp') },
  { keys: ['enter'], action: listAction('open') },
];
