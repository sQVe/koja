// The keys.json action for a command with its first string argument, such as "app.theme:graphite".
// The bare command names it when that argument is not a string.

export const bindingAction = (command: string, args: Record<string, unknown>): string => {
  const value = Object.values(args)[0];

  return typeof value === 'string' ? `${command}:${value}` : command;
};
