import { bindingAction } from './binding.ts';

export type NormalIntent =
  | 'closeOtherPanes'
  | 'nextPane'
  | 'previousPane'
  | 'lastPane'
  | 'lastTab'
  | 'nextSpace'
  | 'previousSpace';

export type NormalAction =
  | { kind: 'command'; command: string }
  | { kind: 'intent'; intent: NormalIntent }
  | { kind: 'nthTab'; index: number }
  | { kind: 'leave' };

export interface NormalKey {
  keys: string[];
  action: NormalAction;
  counted?: 'nthTab';
}

const herdrCommand = (command: string, args: Record<string, unknown> = {}): NormalAction => ({
  kind: 'command',
  command: bindingAction(command, args),
});

const intentAction = (intent: NormalIntent): NormalAction => ({ kind: 'intent', intent });

const leaveAction: NormalAction = { kind: 'leave' };

export const normalKeys: NormalKey[] = [
  { keys: ['ctrl-h'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['ctrl-j'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['ctrl-k'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['ctrl-l'], action: herdrCommand('pane.go', { direction: 'right' }) },
  { keys: ['ctrl-w', 'h'], action: herdrCommand('pane.go', { direction: 'left' }) },
  { keys: ['ctrl-w', 'j'], action: herdrCommand('pane.go', { direction: 'down' }) },
  { keys: ['ctrl-w', 'k'], action: herdrCommand('pane.go', { direction: 'up' }) },
  { keys: ['ctrl-w', 'l'], action: herdrCommand('pane.go', { direction: 'right' }) },
  { keys: ['ctrl-w', 'H'], action: herdrCommand('pane.swap', { direction: 'left' }) },
  { keys: ['ctrl-w', 'J'], action: herdrCommand('pane.swap', { direction: 'down' }) },
  { keys: ['ctrl-w', 'K'], action: herdrCommand('pane.swap', { direction: 'up' }) },
  { keys: ['ctrl-w', 'L'], action: herdrCommand('pane.swap', { direction: 'right' }) },
  { keys: ['ctrl-w', 's'], action: herdrCommand('pane.split', { direction: 'down' }) },
  { keys: ['ctrl-w', 'n'], action: herdrCommand('pane.split', { direction: 'down' }) },
  { keys: ['ctrl-w', 'v'], action: herdrCommand('pane.split', { direction: 'right' }) },
  { keys: ['ctrl-w', 'q'], action: herdrCommand('pane.close') },
  { keys: ['ctrl-w', 'c'], action: herdrCommand('pane.close') },
  { keys: ['ctrl-w', 'o'], action: intentAction('closeOtherPanes') },
  { keys: ['ctrl-w', 'm'], action: herdrCommand('pane.zoom') },
  { keys: ['ctrl-w', '_'], action: herdrCommand('pane.zoom') },
  { keys: ['ctrl-w', '|'], action: herdrCommand('pane.zoom') },
  { keys: ['ctrl-w', 'w'], action: intentAction('nextPane') },
  { keys: ['ctrl-w', 'W'], action: intentAction('previousPane') },
  { keys: ['ctrl-w', 'p'], action: intentAction('lastPane') },
  { keys: ['ctrl-t', 'w'], action: herdrCommand('tab.new') },
  { keys: ['ctrl-t', 'ctrl-w'], action: herdrCommand('tab.new') },
  { keys: ['ctrl-t', 'n'], action: herdrCommand('tab.next') },
  { keys: ['ctrl-t', 'ctrl-n'], action: herdrCommand('tab.next') },
  { keys: ['ctrl-t', 'p'], action: herdrCommand('tab.prev') },
  { keys: ['ctrl-t', 'ctrl-p'], action: herdrCommand('tab.prev') },
  { keys: ['ctrl-t', 'q'], action: herdrCommand('tab.close') },
  { keys: ['ctrl-t', 'ctrl-q'], action: herdrCommand('tab.close') },
  { keys: ['g', 't'], action: herdrCommand('tab.next'), counted: 'nthTab' },
  { keys: ['g', 'T'], action: herdrCommand('tab.prev') },
  { keys: ['g', 'tab'], action: intentAction('lastTab') },
  { keys: ['tab'], action: intentAction('nextSpace') },
  { keys: ['shift-tab'], action: intentAction('previousSpace') },
  { keys: ['ctrl-q', 'n'], action: herdrCommand('agent.next') },
  { keys: ['ctrl-q', 'ctrl-n'], action: herdrCommand('agent.next') },
  { keys: ['ctrl-q', 'p'], action: herdrCommand('agent.prev') },
  { keys: ['ctrl-q', 'ctrl-p'], action: herdrCommand('agent.prev') },
  { keys: ['backspace'], action: herdrCommand('mod.open', { name: 'koja-palette' }) },
  { keys: ['ö'], action: herdrCommand('mod.open', { name: 'koja-palette' }) },
  { keys: ['space', 'space'], action: herdrCommand('mod.open', { name: 'koja-picker' }) },
  { keys: ['i'], action: leaveAction },
  { keys: ['a'], action: leaveAction },
  { keys: ['enter'], action: leaveAction },
];
