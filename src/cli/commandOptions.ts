export interface CommandOptions {
  json: boolean;
  socket: string | undefined;
}

// Options beyond --socket and --json that each command accepts. A command's position sets the
// order in which "belongs to" messages name it.
const acceptedOptions = new Map<string, readonly string[]>([
  ['koja', []],
  ['koja --version', []],
  ['attach', []],
  ['server run', []],
  ['server start', []],
  ['server stop', []],
  ['client list', []],
  ['workspace list', []],
  ['workspace create', ['label', 'focus', 'no-focus']],
  ['workspace focus', []],
  ['workspace rename', []],
  ['workspace close', []],
  ['detach', ['client']],
  ['pane list', []],
  ['pane read', ['source', 'lines', 'from', 'to']],
  ['pane send', ['pane']],
  ['pane paste', ['pane', 'authorize']],
  ['pane split', ['direction', 'cwd']],
  ['pane move', ['tab', 'new-tab', 'new-workspace']],
  ['pane focus', []],
  ['pane close', []],
  ['pane zoom', []],
  ['pane resize', ['direction', 'cells']],
  ['pane scroll', ['to', 'client']],
  ['pane copy', ['from', 'to', 'print']],
  ['pane process-info', []],
  ['pi report', []],
  ['pi status', []],
  ['tab list', []],
  ['tab create', ['workspace', 'cwd', 'focus', 'no-focus']],
  ['tab focus', []],
  ['tab rename', []],
  ['tab close', []],
  ['action list', []],
  ['action run', ['pane', 'workspace']],
]);

const sharedOptions: ReadonlySet<string> = new Set(['json', 'socket', 'version']);

const paneIdCommands: ReadonlySet<string> = new Set(['pane read', 'pane scroll', 'pane copy']);

const joinNames = (names: string[]): string => {
  if (names.length <= 2) {
    return names.join(' and ');
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
};

const acceptingCommands = (option: string): string[] =>
  [...acceptedOptions]
    .filter(([, options]) => options.includes(option))
    .map(([command]) => command);

const isFocusOption = (option: string): boolean => option === 'focus' || option === 'no-focus';

const belongsMessage = (option: string): string => {
  const commands = joinNames(acceptingCommands(option));

  return isFocusOption(option)
    ? `--focus and --no-focus belong to ${commands}.`
    : `--${option} belongs to ${commands}.`;
};

// Returns undefined when the command is unknown, so its own parser reports that.
export const strayOptionMessage = (command: string, given: string[]): string | undefined => {
  const accepted = acceptedOptions.get(command);

  if (accepted === undefined) {
    return undefined;
  }

  const stray = given.find((option) => !sharedOptions.has(option) && !accepted.includes(option));

  if (stray === undefined) {
    return undefined;
  }

  const message = belongsMessage(stray);

  return stray === 'pane' && paneIdCommands.has(command)
    ? `${message} ${command} takes the pane id as an argument.`
    : message;
};
