import { describe, expect, test } from 'bun:test';

import type { Agent } from './agents.ts';
import { agentList, placeholderFor } from './agents.ts';

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
    expect(placeholderFor({ status: 'pending' })).not.toBeNull();
  });

  test('says it could not load after a failure', () => {
    expect(placeholderFor({ status: 'failed' })).not.toBeNull();
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
