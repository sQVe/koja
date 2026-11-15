export const namesBinding = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

export const bindingAction = (command: string, args: Record<string, unknown>): string => {
  const value = Object.values(args)[0];

  return namesBinding(value) ? `${command}:${value}` : command;
};
