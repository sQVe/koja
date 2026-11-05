import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { Agent } from './agents.ts';
import { agentLaunch, agentList, menuActions, menuTarget, placeholderFor } from './agents.ts';

const agent: Agent = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
  run: ['zsh'],
  installed: true,
};

describe('placeholderFor', () => {
  test('says it is checking while the list loads', () => {
    expect(placeholderFor({ status: 'pending' })?.kind).toBe('loading');
  });

  test('says it could not load after a failure', () => {
    expect(placeholderFor({ status: 'failed' })?.kind).toBe('error');
  });

  test('shows nothing once loading ends, even with no agents', () => {
    expect(placeholderFor({ status: 'loaded', agents: [] })).toBeNull();
  });
});

describe('agentList', () => {
  test('answers the loaded agents and nothing before that', () => {
    expect(agentList({ status: 'loaded', agents: [agent] })).toEqual([agent]);
    expect(agentList({ status: 'pending' })).toEqual([]);
    expect(agentList({ status: 'failed' })).toEqual([]);
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

    expect(agentLaunch(agent, target)).toEqual({
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

    expect(actions.agent(agent)).toEqual({ name: 'zsh', space: 'remote-space', argv: ['zsh'] });
    expect(actions.terminal).toEqual({ space: 'remote-space' });
    expect(actions.space).toEqual({ machine: 'remote' });
    expect(actions.worktree).toEqual({ space: 'remote-space', folder: '/work/koja' });
  });

  test('pins New space to the local computer when the target has no machine', () => {
    const actions = menuActions({ space: null, machine: null, folder: null });

    expect(actions.space).toEqual({ machine: '' });
  });
});
