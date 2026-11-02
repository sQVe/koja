import { describe, expect, test } from 'bun:test';

import { isMachineLoading, machineGroupOrder, readMachines } from './machines.ts';

describe('readMachines', () => {
  test('reads names and states, and drops temporary machines', () => {
    const stdout = JSON.stringify({
      machines: [
        { name: 'work', state: 'connected' },
        { name: 'sandbox', state: 'connected', temporary: true },
        { name: 'home' },
      ],
    });

    expect(readMachines(stdout)).toEqual([
      { name: 'work', state: 'connected' },
      { name: 'home', state: null },
    ]);
  });
});

describe('machineGroupOrder', () => {
  test('puts this computer first and sorts the rest', () => {
    const known = [
      { name: 'zebra', state: null },
      { name: 'alpha', state: null },
    ];

    expect(machineGroupOrder(['beta', 'alpha'], known)).toEqual([null, 'alpha', 'beta', 'zebra']);
  });
});

describe('isMachineLoading', () => {
  test('is loading while the layout is loading', () => {
    expect(isMachineLoading('loading', true, false)).toBe(true);
  });

  test('is loading while a connected machine has no layout yet', () => {
    expect(isMachineLoading(undefined, true, false)).toBe(true);
  });

  test('is not loading once the layout is ready', () => {
    expect(isMachineLoading('ready', true, false)).toBe(false);
  });
});
