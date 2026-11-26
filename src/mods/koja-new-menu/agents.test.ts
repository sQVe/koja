import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { Agent } from './agents.ts';
import { agentLaunch, agentState, installedAgents, menuActions, menuTarget } from './agents.ts';

const agent = (name: string, installed: boolean): Agent => ({
  key: name,
  name,
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
  run: [name],
  installed,
});

describe('agentState', () => {
  test('says it is checking while the list loads', () => {
    expect(agentState({ status: 'pending' })?.kind).toBe('loading');
  });

  test('says it could not load after a failure', () => {
    expect(agentState({ status: 'failed' })?.kind).toBe('error');
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
    expect(installedAgents({ status: 'pending' })).toEqual([]);
    expect(installedAgents({ status: 'failed' })).toEqual([]);
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
