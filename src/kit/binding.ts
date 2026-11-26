import { commandIdentity } from './commandTitles.ts';
import { recordOf, stringOf } from './fields.ts';

export const namesBinding = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

export const bindingAction = (command: string, args: Record<string, unknown>): string => {
  const value = Object.values(args)[0];

  return namesBinding(value) ? `${command}:${value}` : command;
};

// keys.json takes a JSON object for an action: its command and the arguments it runs with.
export const actionIdentity = (action: string): string | null => {
  if (!action.startsWith('{')) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(action);
    const record = recordOf(parsed);
    const command = stringOf(record['command']);

    return command === null ? null : commandIdentity(command, recordOf(record['args']));
  } catch {
    return null;
  }
};
