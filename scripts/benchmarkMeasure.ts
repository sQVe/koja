import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { BenchmarkClient } from './benchmarkClient.ts';
import { startResourceSampler } from './benchmarkResources.ts';
import type { ResourceReport } from './benchmarkResources.ts';
import type { GuestResources, ProcessResources } from './benchmarkResult.ts';
import type { BenchmarkPanes, KojaRunner } from './benchmarkServer.ts';

interface ScenarioConfiguration {
  columns: number;
  rows: number;
  samples: number;
  idleDurationMs: number;
  floodBytes: number;
  resizeCount: number;
}

export interface ScenarioContext {
  folder: string;
  environment: Record<string, string | undefined>;
  serverProcessId: number;
  koja: KojaRunner;
  client: BenchmarkClient;
  panes: BenchmarkPanes;
  configuration: ScenarioConfiguration;
}

export interface ScenarioGap {
  metric: string;
  reason: string;
}

export interface ScenarioResult {
  latencyMs?: number[];
  completionMs?: number[];
  controlMs?: number[];
  client?: ProcessResources;
  server?: ProcessResources;
  guests?: GuestResources;
  gaps: ScenarioGap[];
}

export type Sample = { ok: true; latencyMs: number } | { ok: false; reason: string };

export interface SiblingFlood {
  running: () => boolean;
  stop: (gaps: ScenarioGap[]) => Promise<void>;
}

interface Timing {
  latencyMs?: number[];
  completionMs?: number[];
  controlMs?: number[];
  gaps?: ScenarioGap[];
}

export const readTimeoutMs = 30_000;

const markerSuffixLength = 8;

const floodBytesPerTimeoutMs = 200;

export const marker = (label: string): string =>
  `KOJA-BENCH-${label}-${randomUUID().slice(0, markerSuffixLength)}`;

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const floodTimeoutMs = (bytes: number): number =>
  Math.max(readTimeoutMs, Math.ceil(bytes / floodBytesPerTimeoutMs));

export const printMarkerCommand = (text: string): string => {
  const middle = Math.floor(text.length / 2);

  return `printf '\\n%s%s\\n' '${text.slice(0, middle)}' '${text.slice(middle)}'`;
};

const shellQuoted = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

export const floodCommand = (bytes: number, endMarker: string): string =>
  `head -c ${bytes} /dev/zero | tr '\\0' f; ${printMarkerCommand(endMarker)}`;

export const unboundedFloodCommand = (sentinelPath: string): string =>
  `tr '\\0' f < /dev/zero; : > ${shellQuoted(sentinelPath)}`;

export const floodSentinelName = (label: string): string => `${label.toLowerCase()}-flood.ended`;

export const paneAt = (context: ScenarioContext, index: number): string =>
  context.panes.visible[index] ?? context.panes.focused;

export const lastLine = (context: ScenarioContext): string =>
  context.client.text().split('\n').at(-1)?.trimEnd() ?? '';

export const sendPaneCommand = async (
  context: ScenarioContext,
  pane: string,
  command: string,
): Promise<void> => {
  const sent = await context.koja('pane', 'send', `${command}\n`, '--pane', pane);

  if (sent.exitCode !== 0) {
    throw new Error(`Sending to ${pane} failed: ${sent.stderr}`);
  }
};

const combine = (timing: Timing, resources: ResourceReport): ScenarioResult => {
  const gaps = [...resources.gaps, ...(timing.gaps ?? [])];

  return {
    ...(timing.latencyMs === undefined ? {} : { latencyMs: timing.latencyMs }),
    ...(timing.completionMs === undefined ? {} : { completionMs: timing.completionMs }),
    ...(timing.controlMs === undefined ? {} : { controlMs: timing.controlMs }),
    ...(resources.client === undefined ? {} : { client: resources.client }),
    ...(resources.server === undefined ? {} : { server: resources.server }),
    ...(resources.guests === undefined ? {} : { guests: resources.guests }),
    gaps,
  };
};

export const measure = async (
  context: ScenarioContext,
  action: () => Promise<Timing>,
): Promise<ScenarioResult> => {
  const sampler = startResourceSampler(context.client.processId, context.serverProcessId);
  let timing: Timing;

  try {
    timing = await action();
  } catch (error) {
    sampler.stop();

    throw error;
  }

  return combine(timing, sampler.stop());
};

export const startSiblingFlood = async (
  context: ScenarioContext,
  pane: string,
  label: string,
): Promise<SiblingFlood> => {
  const sentinelPath = join(context.folder, floodSentinelName(label));

  if (existsSync(sentinelPath)) {
    throw new Error(`The flood sentinel ${sentinelPath} already exists.`);
  }

  await sendPaneCommand(context, pane, unboundedFloodCommand(sentinelPath));

  const stop = async (gaps: ScenarioGap[]): Promise<void> => {
    const stopMarker = marker(`${label}-STOP`);

    await sendPaneCommand(context, pane, '\u0003');
    await sendPaneCommand(context, pane, printMarkerCommand(stopMarker));

    try {
      await context.client.waitForText(stopMarker, readTimeoutMs);
    } catch (error) {
      gaps.push({ metric: `${label.toLowerCase()}Stop`, reason: messageOf(error) });
    }
  };

  return { running: () => !existsSync(sentinelPath), stop };
};
