export interface KeyBinding {
  section: string;
  keys: string;
  action: string;
}

export const bindingFor = (
  bindings: readonly KeyBinding[],
  ...actions: string[]
): string | null => {
  const global = bindings.filter((candidate) => candidate.section === 'global');

  for (const action of actions) {
    const binding = global.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      return binding.keys;
    }
  }

  return null;
};
