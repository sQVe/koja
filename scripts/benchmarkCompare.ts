import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { resultSchema } from './benchmarkResult.ts';
import type { BenchmarkResult, ScenarioMeasurement } from './benchmarkResult.ts';
import { scenarioNames } from './benchmarkScenarios.ts';

interface SampleSummary {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

type MetricValue = SampleSummary | number | null;

interface FieldDifference {
  field: string;
  first: unknown;
  second: unknown;
}

type ScenarioName = (typeof scenarioNames)[number];

type ReadResult = { ok: true; result: BenchmarkResult } | { ok: false; message: string };

const sampleNames = ['latencyMs', 'completionMs', 'controlMs'] as const;

const resourceNames = ['client', 'server', 'guests'] as const;

const percentScale = 100;

const medianPercentile = 50;

const tailPercentile = 95;

const columnGap = 2;

const displayDecimals = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const fieldDifferences = (field: string, first: unknown, second: unknown): FieldDifference[] => {
  if (!isRecord(first) || !isRecord(second)) {
    return Object.is(first, second) ? [] : [{ field, first, second }];
  }

  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);

  return [...keys].flatMap((key) => fieldDifferences(`${field}.${key}`, first[key], second[key]));
};

const nearestRank = (sorted: number[], percentile: number): number => {
  const index = Math.max(Math.ceil((percentile / percentScale) * sorted.length) - 1, 0);

  return sorted[index] ?? Number.NaN;
};

const summarize = (samples: number[]): SampleSummary | null => {
  if (samples.length === 0) {
    return null;
  }

  const sorted = samples.toSorted((left, right) => left - right);

  return {
    count: sorted.length,
    min: nearestRank(sorted, 0),
    median: nearestRank(sorted, medianPercentile),
    p95: nearestRank(sorted, tailPercentile),
    max: nearestRank(sorted, percentScale),
  };
};

const readResult = async (path: string): Promise<ReadResult> => {
  let data: unknown;

  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      message: `${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = resultSchema.safeParse(data);

  if (!parsed.success) {
    return {
      ok: false,
      message: `${path} is not a benchmark result:\n${z.prettifyError(parsed.error)}`,
    };
  }

  return { ok: true, result: parsed.data };
};

const hasGap = (result: BenchmarkResult, scenario: string, metric: string): boolean =>
  result.gaps.some((gap) => gap.scenario === scenario && gap.metric === metric);

type MetricName = (typeof sampleNames)[number] | (typeof resourceNames)[number];

const requiredMetrics: Record<ScenarioName, readonly MetricName[]> = {
  idle: resourceNames,
  typingUnderFlood: ['latencyMs', 'completionMs', ...resourceNames],
  busyScroll: ['latencyMs', ...resourceNames],
  hiddenOutput: ['completionMs', ...resourceNames],
  resizeBurst: ['latencyMs', ...resourceNames],
  paneList: ['latencyMs', 'controlMs', ...resourceNames],
};

const hasMetric = (
  result: BenchmarkResult,
  scenario: ScenarioName,
  metric: MetricName,
): boolean => {
  const value = result.scenarios[scenario][metric];

  return Array.isArray(value) ? value.length > 0 : value !== undefined;
};

const unexplainedMissingMetric = (
  results: [BenchmarkResult, BenchmarkResult],
  paths: [string, string],
  scenario: ScenarioName,
  metric: MetricName,
): string[] => {
  const required = requiredMetrics[scenario].includes(metric);
  const [first, second] = results;
  const presentInOther = [hasMetric(second, scenario, metric), hasMetric(first, scenario, metric)];

  return results.flatMap((result, index) => {
    const expected = required || presentInOther[index] === true;
    const explained = hasMetric(result, scenario, metric) || hasGap(result, scenario, metric);

    if (!expected || explained) {
      return [];
    }

    return [
      `scenarios.${scenario}.${metric} is missing from ${paths[index]}, which has no gap for it.`,
    ];
  });
};

const unexplainedMissingMetrics = (
  results: [BenchmarkResult, BenchmarkResult],
  paths: [string, string],
): string[] =>
  scenarioNames.flatMap((scenario) =>
    [...sampleNames, ...resourceNames].flatMap((metric) =>
      unexplainedMissingMetric(results, paths, scenario, metric),
    ),
  );

const machineFields = (result: BenchmarkResult) => ({
  cpuModel: result.machine.cpuModel,
  cores: result.machine.cores,
  kernel: result.machine.kernel,
});

const shapeMismatches = (results: [BenchmarkResult, BenchmarkResult]): FieldDifference[] => {
  const [first, second] = results;

  return [
    ...fieldDifferences('configuration', first.configuration, second.configuration),
    ...fieldDifferences('machine', machineFields(first), machineFields(second)),
    ...fieldDifferences('placement', first.placement, second.placement),
  ];
};

const reportedDifferences = (results: [BenchmarkResult, BenchmarkResult]): FieldDifference[] => {
  const [first, second] = results;

  return [
    ...fieldDifferences('run', first.run, second.run),
    ...fieldDifferences('revision', first.revision, second.revision),
    ...fieldDifferences('machine.governor', first.machine.governor, second.machine.governor),
    ...fieldDifferences(
      'machine.memoryTotalKb',
      first.machine.memoryTotalKb,
      second.machine.memoryTotalKb,
    ),
  ];
};

const processValues = (
  name: string,
  resources: ScenarioMeasurement['client'],
): Record<string, number | null> => ({
  [`${name}.cpuMs`]: resources?.cpuMs ?? null,
  [`${name}.rssKb.start`]: resources?.rssKb.start ?? null,
  [`${name}.rssKb.end`]: resources?.rssKb.end ?? null,
  [`${name}.rssKb.peak`]: resources?.rssKb.peak ?? null,
});

const guestValues = (guests: ScenarioMeasurement['guests']): Record<string, number | null> => ({
  'guests.cpuMs': guests?.cpuMs ?? null,
  'guests.memoryBytes.lifetimePeak': guests?.memoryBytes.lifetimePeak ?? null,
  'guests.memoryBytes.end': guests?.memoryBytes.end ?? null,
});

const scenarioValues = (scenario: ScenarioMeasurement): Record<string, MetricValue> => {
  const values: Record<string, MetricValue> = {};

  for (const name of sampleNames) {
    const samples = scenario[name];

    values[name] = samples === undefined ? null : summarize(samples);
  }

  return {
    ...values,
    ...processValues('client', scenario.client),
    ...processValues('server', scenario.server),
    ...guestValues(scenario.guests),
  };
};

const compareScenarios = (
  results: [BenchmarkResult, BenchmarkResult],
): Record<string, Record<string, MetricValue[]>> => {
  const scenarios: Record<string, Record<string, MetricValue[]>> = {};

  for (const scenario of scenarioNames) {
    const [first, second] = results.map((result) => scenarioValues(result.scenarios[scenario]));
    const metrics: Record<string, MetricValue[]> = {};

    for (const [metric, value] of Object.entries(first ?? {})) {
      const otherValue = second?.[metric] ?? null;

      if (value !== null || otherValue !== null) {
        metrics[metric] = [value, otherValue];
      }
    }

    scenarios[scenario] = metrics;
  }

  return scenarios;
};

const displayNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(displayDecimals);

const formatValue = (value: MetricValue): string => {
  if (value === null) {
    return '-';
  }

  if (typeof value === 'number') {
    return displayNumber(value);
  }

  const statistics = [value.min, value.median, value.p95, value.max].map(displayNumber);

  return `${statistics.join(' / ')} (n=${value.count})`;
};

const formatTable = (rows: string[][]): string[] => {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );

  return rows.map((row) => {
    const cells = row.map((cell, column) => cell.padEnd((widths?.[column] ?? 0) + columnGap));

    return `  ${cells.join('').trimEnd()}`;
  });
};

const formatSummary = (
  paths: [string, string],
  reported: FieldDifference[],
  scenarios: Record<string, Record<string, MetricValue[]>>,
  results: [BenchmarkResult, BenchmarkResult],
): string => {
  const lines = ['Runs'];

  for (const [index, path] of paths.entries()) {
    lines.push(`  run ${index + 1}: ${path}`);
  }

  lines.push('', 'Reported differences');

  for (const difference of reported) {
    const values = `${JSON.stringify(difference.first)} vs ${JSON.stringify(difference.second)}`;

    lines.push(`  ${difference.field}: ${values}`);
  }

  if (reported.length === 0) {
    lines.push('  none');
  }

  lines.push('', 'Sample arrays show min / median / p95 / max (n=count).');

  for (const [scenario, metrics] of Object.entries(scenarios)) {
    const rows = [['metric', 'run 1', 'run 2']];

    for (const [metric, values] of Object.entries(metrics)) {
      rows.push([metric, ...values.map(formatValue)]);
    }

    lines.push('', scenario, ...formatTable(rows));
  }

  lines.push('', 'Gaps');

  for (const [index, result] of results.entries()) {
    for (const gap of result.gaps) {
      lines.push(`  run ${index + 1}: ${gap.scenario}.${gap.metric}: ${gap.reason}`);
    }
  }

  if (results.every((result) => result.gaps.length === 0)) {
    lines.push('  none');
  }

  return `${lines.join('\n')}\n`;
};

const parseCompareArguments = (
  args: string[],
): { ok: true; paths: [string, string]; json: boolean } | { ok: false; message: string } => {
  let parsed: { values: { json?: boolean }; positionals: string[] };

  try {
    parsed = parseArgs({
      args,
      options: { json: { type: 'boolean' } },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const [first, second, ...rest] = parsed.positionals;

  if (first === undefined || second === undefined || rest.length > 0) {
    return { ok: false, message: '--compare takes exactly two result files.' };
  }

  return { ok: true, paths: [first, second], json: parsed.values.json === true };
};

export const runCompare = async (args: string[]): Promise<number> => {
  const parsed = parseCompareArguments(args);

  if (!parsed.ok) {
    process.stderr.write(`koja benchmark: ${parsed.message}\n`);

    return 2;
  }

  const read = await Promise.all(parsed.paths.map(readResult));
  const failures = read.flatMap((entry) => (entry.ok ? [] : [entry.message]));
  const [first, second] = read;

  if (failures.length > 0 || first?.ok !== true || second?.ok !== true) {
    process.stderr.write(`koja benchmark: ${failures.join('\n')}\n`);

    return 1;
  }

  const results: [BenchmarkResult, BenchmarkResult] = [first.result, second.result];

  const problems = [
    ...shapeMismatches(results).map(
      (difference) =>
        `${difference.field} differs: ${JSON.stringify(difference.first)} vs ${JSON.stringify(difference.second)}`,
    ),
    ...unexplainedMissingMetrics(results, parsed.paths),
  ];

  if (problems.length > 0) {
    process.stderr.write(
      `koja benchmark: the runs do not share one shape:\n  ${problems.join('\n  ')}\n`,
    );

    return 1;
  }

  const reported = reportedDifferences(results);
  const scenarios = compareScenarios(results);

  if (parsed.json) {
    const gaps = results.map((result) => result.gaps);

    process.stdout.write(
      `${JSON.stringify({ files: parsed.paths, reported, scenarios, gaps }, null, 2)}\n`,
    );

    return 0;
  }

  process.stdout.write(formatSummary(parsed.paths, reported, scenarios, results));

  return 0;
};
