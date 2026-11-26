import type { SpaceInfo } from 'herdr';

import { listOf, recordOf, stringListOf, stringOf } from '../../kit/fields.ts';

export interface Agent {
  key: string;
  name: string;
  run: string[];
  installed: boolean;
}

export type AgentLoad =
  | { status: 'pending' }
  | { status: 'failed'; agents: Agent[] }
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

// The last agents each machine reported, so the menu opens with them while it checks again.
export const knownAgentsKey = 'new-menu.agents';

const cachedAgent = (value: unknown): Agent | null => {
  const record = recordOf(value);
  const key = stringOf(record['key']);
  const name = stringOf(record['name']);
  const installed = record['installed'];

  if (key === null || name === null || typeof installed !== 'boolean') {
    return null;
  }

  return { key, name, run: stringListOf(record['run']), installed };
};

// A space names its machine only when it is another one, so "" is this computer.
const machineKey = (machine: string | null): string => machine ?? '';

export const cachedAgents = (store: unknown, machine: string | null): Agent[] =>
  listOf(recordOf(store)[machineKey(machine)]).flatMap((value) => {
    const agent = cachedAgent(value);

    return agent === null ? [] : [agent];
  });

export const rememberAgents = (
  store: unknown,
  machine: string | null,
  agents: Agent[],
): Record<string, unknown> => ({ ...recordOf(store), [machineKey(machine)]: agents });

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
  load.status === 'pending' ? [] : load.agents.filter((agent) => agent.installed);

export const agentState = (load: AgentLoad): AgentState | null => {
  if (load.status === 'pending') {
    return { kind: 'loading', text: 'Checking installed agents…' };
  }

  if (load.status === 'failed') {
    return { kind: 'error', text: 'Could not check installed agents' };
  }

  if (installedAgents(load).length > 0) {
    return null;
  }

  return { kind: 'empty', text: 'No agents installed' };
};
