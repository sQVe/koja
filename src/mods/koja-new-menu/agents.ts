import type { Program } from 'herdr';

export type Agent = Program & { run: string[]; installed: boolean };

export type AgentLoad =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'loaded'; agents: Agent[] };

export const agentList = (load: AgentLoad): Agent[] =>
  load.status === 'loaded' ? load.agents : [];

// What the list says while it has no agents to show; loaded-empty shows the rest of the menu.
export const placeholderFor = (load: AgentLoad): string | null => {
  if (load.status === 'pending') {
    return 'Checking installed agents…';
  }

  return load.status === 'failed' ? 'Could not load agents' : null;
};
