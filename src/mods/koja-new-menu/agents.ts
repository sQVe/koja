import type { Program, SpaceInfo } from 'herdr';

export type Agent = Program & { run: string[]; installed: boolean };

export type AgentLoad =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'loaded'; agents: Agent[] };

export interface AgentState {
  kind: 'loading' | 'empty' | 'error';
  text: string;
}

export interface MenuTarget {
  space: string | null;
  machine: string | null;
  folder: string | null;
}

export interface AgentLaunch extends Record<string, unknown> {
  name: string;
  space: string | null;
  argv: string[];
}

export interface MenuActions {
  agent: (agent: Agent) => AgentLaunch;
  terminal: Record<string, unknown>;
  space: Record<string, unknown>;
  worktree: { space: string | null; folder: string | null };
}

export const menuTarget = (space: SpaceInfo | undefined, folder: string | null): MenuTarget => ({
  space: space?.id ?? null,
  machine: space?.machine ?? null,
  folder,
});

export const agentLaunch = (agent: Agent, target: MenuTarget): AgentLaunch => ({
  name: agent.name,
  space: target.space,
  argv: agent.run,
});

export const menuActions = (target: MenuTarget): MenuActions => ({
  agent: (agent) => agentLaunch(agent, target),
  terminal: { space: target.space },
  space: { machine: target.machine ?? '' },
  worktree: { space: target.space, folder: target.folder },
});

export const installedAgents = (load: AgentLoad): Agent[] =>
  load.status === 'loaded' ? load.agents.filter((agent) => agent.installed) : [];

export const agentState = (load: AgentLoad): AgentState | null => {
  if (load.status === 'pending') {
    return { kind: 'loading', text: 'Checking installed agents…' };
  }

  if (load.status === 'failed') {
    return { kind: 'error', text: 'Could not load agents' };
  }

  if (installedAgents(load).length > 0) {
    return null;
  }

  return { kind: 'empty', text: 'No agents installed' };
};
