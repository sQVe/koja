import type { Program } from 'herdr';

export type Agent = Program & { run: string[]; installed: boolean };

export type AgentLoad =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'loaded'; agents: Agent[] };

export const agentList = (load: AgentLoad): Agent[] =>
  load.status === 'loaded' ? load.agents : [];

export const placeholderFor = (load: AgentLoad): string | null => {
  if (load.status === 'pending') {
    return 'Checking installed agents…';
  }

  return load.status === 'failed' ? 'Could not load agents' : null;
};
