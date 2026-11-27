import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { Agent } from './agents.ts';
import {
  agentLaunch,
  agentState,
  cachedAgents,
  installedAgents,
  menuActions,
  menuTarget,
  rememberAgents,
} from './agents.ts';

const agent = (name: string, installed: boolean): Agent => ({
  key: name,
  name,
  run: [name],
  installed,
});

describe('agentState', () => {
  test('says it is checking while the list loads', () => {
    expect(agentState({ status: 'pending' })?.kind).toBe('loading');
  });

  test('says it could not load after a failure', () => {
    expect(agentState({ status: 'failed', agents: [] })?.kind).toBe('error');
    expect(agentState({ status: 'failed', agents: [agent('pi', true)] })?.kind).toBe('error');
  });

  test('says no agent is installed when the list holds none', () => {
    expect(agentState({ status: 'loaded', agents: [] })?.kind).toBe('empty');
    expect(agentState({ status: 'loaded', agents: [agent('claude', false)] })?.kind).toBe('empty');
  });

  test('shows no state line once an installed agent is there to start', () => {
    expect(agentState({ status: 'loaded', agents: [agent('pi', true)] })).toBeNull();
  });
});

describe('installedAgents', () => {
  test('answers the installed agents and nothing before the list loads', () => {
    const pi = agent('pi', true);
    const claude = agent('claude', false);

    expect(installedAgents({ status: 'loaded', agents: [pi, claude] })).toEqual([pi]);
    expect(installedAgents({ status: 'failed', agents: [pi, claude] })).toEqual([pi]);
    expect(installedAgents({ status: 'pending' })).toEqual([]);
  });
});

describe('cachedAgents', () => {
  test('answers the agents the store holds for a machine', () => {
    const store = { '': [agent('pi', true)], remote: [agent('claude', false)] };

    expect(cachedAgents(store, null)).toEqual([agent('pi', true)]);
    expect(cachedAgents(store, 'remote')).toEqual([agent('claude', false)]);
  });

  test('answers no agents for a machine the store has never seen', () => {
    expect(cachedAgents(undefined, null)).toEqual([]);
    expect(cachedAgents({ remote: [agent('pi', true)] }, null)).toEqual([]);
  });

  test('drops a stored entry that is not an agent', () => {
    const stored = [
      { key: 'pi' },
      { key: 'pi', name: 'Pi', run: ['pi'], installed: 'yes' },
      { name: 'Pi', run: ['pi'], installed: true },
      { key: 'pi', run: ['pi'], installed: true },
      { key: 'pi', name: 'Pi', run: ['pi'] },
      agent('pi', true),
    ];

    expect(cachedAgents({ '': stored }, null)).toEqual([agent('pi', true)]);
  });
});

describe('rememberAgents', () => {
  test('keeps the agents the other machines reported', () => {
    expect(rememberAgents({ remote: [agent('claude', true)] }, null, [agent('pi', true)])).toEqual({
      remote: [agent('claude', true)],
      '': [agent('pi', true)],
    });
  });

  test('starts a store that holds nothing yet', () => {
    expect(rememberAgents(undefined, 'remote', [agent('pi', true)])).toEqual({
      remote: [agent('pi', true)],
    });
  });
});

describe('menuTarget', () => {
  test('captures the space, machine and folder seen when the menu opened', () => {
    const space = { id: 'space-2', machine: 'remote' } as SpaceInfo;

    expect(menuTarget(space, '/work/koja')).toEqual({
      space: 'space-2',
      machine: 'remote',
      folder: '/work/koja',
    });
  });

  test('uses null for a missing space', () => {
    expect(menuTarget(undefined, null)).toEqual({ space: null, machine: null, folder: null });
  });
});

describe('agentLaunch', () => {
  test('builds the launch arguments for the captured target', () => {
    const target = { space: 'space-2', machine: null, folder: null };

    expect(agentLaunch(agent('zsh', true), target)).toEqual({
      name: 'zsh',
      space: 'space-2',
      argv: ['zsh'],
    });
  });
});

describe('menuActions', () => {
  test('builds every action from the captured target', () => {
    const target = { space: 'remote-space', machine: 'remote', folder: '/work/koja' };
    const actions = menuActions(target);

    expect(actions.agent(agent('zsh', true))).toEqual({
      name: 'zsh',
      space: 'remote-space',
      argv: ['zsh'],
    });

    expect(actions.terminal).toEqual({ space: 'remote-space' });
    expect(actions.space).toEqual({ machine: 'remote' });
    expect(actions.worktree).toEqual({ space: 'remote-space', folder: '/work/koja' });
  });

  test('pins New space to the local computer when the target has no machine', () => {
    const actions = menuActions({ space: null, machine: null, folder: null });

    expect(actions.space).toEqual({ machine: '' });
  });
});
