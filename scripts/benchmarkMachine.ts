import { readdirSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';

export interface MachineFacts {
  cpuModel: string;
  cores: number;
  governor: string | undefined;
  kernel: string;
  memoryTotalKb: number | undefined;
}

export interface Placement {
  cpus: number[] | undefined;
  source: 'hybrid-cpu-core' | 'cpuinfo-max-freq' | 'none';
  pinned: boolean;
  tasksetPath: string | undefined;
  reason: string | undefined;
}

interface PlacementFacts {
  hybrid: string | undefined;
  frequencies: Map<number, number[]>;
  tasksetPath: string | undefined;
}

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

const firstMatch = (text: string, pattern: RegExp): string | undefined =>
  pattern.exec(text)?.[1]?.trim();

export const machineFacts = (): MachineFacts => {
  const cpuinfo = readText('/proc/cpuinfo') ?? '';
  const meminfo = readText('/proc/meminfo') ?? '';
  const kernel = readText('/proc/sys/kernel/osrelease') ?? '';
  const memoryTotalKb = Number(firstMatch(meminfo, /^MemTotal:\s*(\d+) kB$/m));

  return {
    cpuModel: firstMatch(cpuinfo, /^model name\s*:\s*(.+)$/m) ?? 'unknown',
    cores: cpus().length,
    governor: readText('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor')?.trim(),
    kernel: kernel.trim(),
    memoryTotalKb: Number.isFinite(memoryTotalKb) ? memoryTotalKb : undefined,
  };
};

const parseCpuList = (text: string): number[] => {
  const numbers: number[] = [];

  for (const part of text.trim().split(',')) {
    if (part === '') {
      continue;
    }

    const [firstText = '', lastText] = part.split('-');
    const first = Number(firstText);
    const last = lastText === undefined ? first : Number(lastText);

    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
      continue;
    }

    for (let cpu = first; cpu <= last; cpu += 1) {
      numbers.push(cpu);
    }
  }

  return numbers;
};

const frequenciesByCpu = (): Map<number, number[]> => {
  const frequencies = new Map<number, number[]>();
  let names: string[];

  try {
    names = readdirSync('/sys/devices/system/cpu');
  } catch {
    return frequencies;
  }

  for (const name of names) {
    const match = /^cpu(\d+)$/.exec(name);

    if (match?.[1] === undefined) {
      continue;
    }

    const frequency = Number(
      readText(`/sys/devices/system/cpu/${name}/cpufreq/cpuinfo_max_freq`)?.trim() ?? '',
    );

    if (!Number.isInteger(frequency) || frequency <= 0) {
      continue;
    }

    const cpu = Number(match[1]);
    const group = frequencies.get(frequency);

    if (group === undefined) {
      frequencies.set(frequency, [cpu]);
    } else {
      group.push(cpu);
    }
  }

  return frequencies;
};

const frequencyGroup = (
  frequencies: Map<number, number[]>,
): { cpus: number[]; reason: string | undefined } | undefined => {
  if (frequencies.size === 0) {
    return undefined;
  }

  if (frequencies.size === 1) {
    return { cpus: [], reason: 'All CPUs report the same maximum frequency.' };
  }

  const [fastest] = [...frequencies.entries()].toSorted(([left], [right]) => right - left);

  return fastest === undefined
    ? undefined
    : { cpus: fastest[1].toSorted((a, b) => a - b), reason: undefined };
};

export const choosePlacement = ({
  hybrid,
  frequencies,
  tasksetPath,
}: PlacementFacts): Placement => {
  const hybridCpus = hybrid === undefined ? [] : parseCpuList(hybrid);

  if (hybridCpus.length > 0) {
    const reason =
      tasksetPath === undefined
        ? 'taskset was not found, so the benchmark did not pin CPUs.'
        : undefined;

    return {
      cpus: hybridCpus,
      source: 'hybrid-cpu-core',
      pinned: tasksetPath !== undefined,
      tasksetPath,
      reason,
    };
  }

  const group = frequencyGroup(frequencies);

  if (group === undefined) {
    return {
      cpus: undefined,
      source: 'none',
      pinned: false,
      tasksetPath,
      reason: 'No hybrid CPU topology or CPU frequency data was readable.',
    };
  }

  if (group.cpus.length === 0) {
    return {
      cpus: undefined,
      source: 'none',
      pinned: false,
      tasksetPath,
      reason: group.reason,
    };
  }

  const reason =
    tasksetPath === undefined
      ? 'taskset was not found, so the benchmark did not pin CPUs.'
      : undefined;

  return {
    cpus: group.cpus,
    source: 'cpuinfo-max-freq',
    pinned: tasksetPath !== undefined,
    tasksetPath,
    reason,
  };
};

export const detectPlacement = (): Placement =>
  choosePlacement({
    hybrid: readText('/sys/devices/cpu_core/cpus'),
    frequencies: frequenciesByCpu(),
    tasksetPath: Bun.which('taskset') ?? undefined,
  });

export const placementCommand = (placement: Placement, command: string[]): string[] => {
  if (!placement.pinned || placement.tasksetPath === undefined || placement.cpus === undefined) {
    return command;
  }

  return [placement.tasksetPath, '-c', placement.cpus.join(','), ...command];
};
