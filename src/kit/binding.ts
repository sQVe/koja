export const bindingAction = (command: string, args: Record<string, unknown>): string => {
  const value = Object.values(args)[0];

  return typeof value === 'string' ? `${command}:${value}` : command;
};
