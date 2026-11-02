import { keys } from 'herdr';

export const shortcutFor = (...actions: string[]): string | null => {
  const bindings = keys().filter((candidate) => candidate.section === 'global');

  for (const action of actions) {
    const binding = bindings.find((candidate) => candidate.action === action);

    if (binding !== undefined) {
      return binding.keys;
    }
  }

  return null;
};
