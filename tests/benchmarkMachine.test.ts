import { describe, expect, it } from 'bun:test';

import { choosePlacement, placementCommand } from '../scripts/benchmarkMachine.ts';

const tasksetPath = '/usr/bin/taskset';

describe('choosing the CPUs a benchmark runs on', () => {
  it('pins to the performance cores a hybrid CPU lists', () => {
    const placement = choosePlacement({
      hybrid: '0-3,8\n',
      frequencies: new Map([
        [5_000_000, [0, 1, 2, 3, 8]],
        [3_000_000, [4, 5, 6, 7]],
      ]),
      tasksetPath,
    });

    expect(placement).toEqual({
      cpus: [0, 1, 2, 3, 8],
      source: 'hybrid-cpu-core',
      pinned: true,
      tasksetPath,
      reason: undefined,
    });
  });

  it('pins to the fastest maximum-frequency group without a hybrid list', () => {
    const placement = choosePlacement({
      hybrid: undefined,
      frequencies: new Map([
        [3_000_000, [0, 1]],
        [5_000_000, [3, 2]],
        [4_000_000, [4]],
      ]),
      tasksetPath,
    });

    expect(placement).toEqual({
      cpus: [2, 3],
      source: 'cpuinfo-max-freq',
      pinned: true,
      tasksetPath,
      reason: undefined,
    });
  });

  it('does not pin when every CPU reports the same maximum frequency', () => {
    const placement = choosePlacement({
      hybrid: '',
      frequencies: new Map([[4_000_000, [0, 1, 2, 3]]]),
      tasksetPath,
    });

    expect(placement).toEqual({
      cpus: undefined,
      source: 'none',
      pinned: false,
      tasksetPath,
      reason: 'All CPUs report the same maximum frequency.',
    });
  });

  it('does not pin when no CPU topology or frequency is readable', () => {
    const placement = choosePlacement({ hybrid: undefined, frequencies: new Map(), tasksetPath });

    expect(placement).toEqual({
      cpus: undefined,
      source: 'none',
      pinned: false,
      tasksetPath,
      reason: 'No hybrid CPU topology or CPU frequency data was readable.',
    });
  });

  it('records the chosen CPUs without pinning when taskset is missing', () => {
    const placement = choosePlacement({
      hybrid: '0-1',
      frequencies: new Map(),
      tasksetPath: undefined,
    });

    expect(placement).toEqual({
      cpus: [0, 1],
      source: 'hybrid-cpu-core',
      pinned: false,
      tasksetPath: undefined,
      reason: 'taskset was not found, so the benchmark did not pin CPUs.',
    });
  });
});

describe('running a command on the chosen CPUs', () => {
  const command = ['bun', 'src/index.ts', 'server', 'run'];

  it('prefixes taskset with the CPU list when the placement is pinned', () => {
    const placement = choosePlacement({ hybrid: '0-2,8', frequencies: new Map(), tasksetPath });

    expect(placementCommand(placement, command)).toEqual([
      tasksetPath,
      '-c',
      '0,1,2,8',
      ...command,
    ]);
  });

  it('runs the command unchanged when the placement is not pinned', () => {
    const unpinned = choosePlacement({
      hybrid: '0-2',
      frequencies: new Map(),
      tasksetPath: undefined,
    });

    const unreadable = choosePlacement({ hybrid: undefined, frequencies: new Map(), tasksetPath });

    expect(placementCommand(unpinned, command)).toEqual(command);
    expect(placementCommand(unreadable, command)).toEqual(command);
  });
});
