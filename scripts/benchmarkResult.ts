import { z } from 'zod';

import { scenarioNames } from './benchmarkScenarios.ts';

const samplesSchema = z.array(z.number().nonnegative());

const processResourcesSchema = z.strictObject({
  cpuMs: z.number().nonnegative(),
  rssKb: z.strictObject({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    peak: z.number().nonnegative(),
  }),
});

const guestResourcesSchema = z.strictObject({
  scopes: z.array(z.string()),
  cpuMs: z.number().nonnegative(),
  memoryBytes: z.strictObject({
    lifetimePeak: z.number().nonnegative(),
    end: z.number().nonnegative(),
  }),
});

const scenarioSchema = z.strictObject({
  latencyMs: samplesSchema.optional(),
  completionMs: samplesSchema.optional(),
  controlMs: samplesSchema.optional(),
  client: processResourcesSchema.optional(),
  server: processResourcesSchema.optional(),
  guests: guestResourcesSchema.optional(),
});

export type ScenarioMeasurement = z.infer<typeof scenarioSchema>;

const configurationSchema = z.strictObject({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  samples: z.number().int().positive(),
  idleDurationMs: z.number().int().positive(),
  floodBytes: z.number().int().positive(),
  resizeCount: z.number().int().positive(),
  visiblePanes: z.number().int().positive(),
  hiddenPanes: z.number().int().nonnegative(),
  ghosttyCommit: z.string().optional(),
  commands: z.strictObject({
    server: z.string(),
    attach: z.string(),
    workspaceCreate: z.string(),
    // Absent in results recorded before new tabs started in master layout.
    tabLayout: z.string().optional(),
    paneSplit: z.array(z.string()),
    paneFocus: z.string(),
    tabCreate: z.string(),
    paneList: z.string(),
    version: z.string(),
    paneRead: z.string(),
  }),
  attachTerminal: z.strictObject({
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  guestPlacement: z.string(),
  guestCommands: z.record(z.string(), z.string()),
  typedInput: z.record(z.string(), z.string()),
  panes: z.strictObject({
    visible: z.array(z.string()),
    focused: z.string(),
    hidden: z.string(),
    visibleTab: z.string(),
  }),
});

export const resultSchema = z.strictObject({
  version: z.literal(1),
  run: z.strictObject({
    root: z.string(),
    runFolder: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    bunVersion: z.string(),
  }),
  configuration: configurationSchema,
  revision: z.strictObject({
    head: z.string(),
    runtimeRevision: z.string(),
    treeHashes: z.record(z.string(), z.string()),
    dirty: z.boolean(),
    packageJsonDigest: z.string(),
  }),
  machine: z.strictObject({
    cpuModel: z.string(),
    cores: z.number().int().positive(),
    governor: z.string().optional(),
    kernel: z.string(),
    memoryTotalKb: z.number().int().positive().optional(),
  }),
  placement: z.strictObject({
    cpus: z.array(z.number().int().nonnegative()).optional(),
    source: z.enum(['hybrid-cpu-core', 'cpuinfo-max-freq', 'none']),
    pinned: z.boolean(),
    tasksetPath: z.string().optional(),
    reason: z.string().optional(),
  }),
  scenarios: z.record(z.enum(scenarioNames), scenarioSchema),
  gaps: z.array(z.strictObject({ scenario: z.string(), metric: z.string(), reason: z.string() })),
});

export type BenchmarkResult = z.infer<typeof resultSchema>;

export type BenchmarkConfiguration = z.infer<typeof resultSchema>['configuration'];

export type ResultGap = z.infer<typeof resultSchema>['gaps'][number];

export type ProcessResources = z.infer<typeof processResourcesSchema>;

export type GuestResources = z.infer<typeof guestResourcesSchema>;
