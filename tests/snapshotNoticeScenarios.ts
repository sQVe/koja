export interface SnapshotNoticeWrite {
  key: string;
  value: unknown;
  messageCount: number;
}

export interface SnapshotNoticeStage {
  name: string;
  messageCount: number;
}

export interface SnapshotNoticeRecord {
  messages: string[];
  stages: SnapshotNoticeStage[];
  writes: SnapshotNoticeWrite[];
  snapshot: unknown;
}

export const snapshotNoticeScenarios = [
  'host-once-per-reason',
  'publisher-malformed',
  'publisher-newer',
  'publisher-silent',
] as const;

export type SnapshotNoticeScenario = (typeof snapshotNoticeScenarios)[number];

export const isSnapshotNoticeScenario = (value: string): value is SnapshotNoticeScenario =>
  snapshotNoticeScenarios.some((scenario) => scenario === value);
