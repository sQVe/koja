import { describe, expect, test } from 'bun:test';

import { isMachineLoading, machineGroupOrder, readMachineList } from './machines.ts';

describe('readMachineList', () => {
  test('reads names and states, and drops temporary machines', () => {
    const value = {
      machines: [
        { name: 'work', state: 'connected' },
        { name: 'sandbox', state: 'connected', temporary: true },
        { name: 'home' },
      ],
    };

    expect(readMachineList(value)).toEqual([
      { name: 'work', state: 'connected' },
      { name: 'home', state: null },
    ]);
  });

  test('a machine list that is not an array is no list', () => {
    expect(readMachineList({ machines: {} })).toBeNull();
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
