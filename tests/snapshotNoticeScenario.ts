import { readDataState } from '../src/data/consumer.ts';
import type { Lease } from '../src/data/lease.ts';
import { heartbeatKey, leaseKey } from '../src/data/lease.ts';
import type { SnapshotPublisher } from '../src/data/publisher.ts';
import { createSnapshotPublisher } from '../src/data/publisher.ts';
import { emptyFacts, snapshotKey } from '../src/data/snapshot.ts';
import * as boundaries from './snapshotNoticeBoundaries.ts';
import { isSnapshotNoticeScenario, snapshotNoticeScenarios } from './snapshotNoticeScenarios.ts';
import type {
  SnapshotNoticeRecord,
  SnapshotNoticeScenario,
  SnapshotNoticeStage,
} from './snapshotNoticeScenarios.ts';

interface HostContext {
  notify: () => void;
  spawn: () => void;
  timer: { every: () => void };
}

interface PublisherScenario {
  lease: Lease;
  publisher: SnapshotPublisher;
}

const hostPath = '../src/data/host.ts';

// The path stays in a variable so tsc does not pull host.ts, and its gpui-kit types, into the
// tests project.
const host = (await import(hostPath)) as { startDataHost: (cx: unknown) => void };

const malformedSnapshot = { version: 2 };

const newerSnapshot = { version: 10, revision: 9, facts: emptyFacts() };

const retiredSnapshot = { version: 1, revision: 4, facts: {} };

const now = 1_800_000_000_000;

const hostContext: HostContext = {
  notify: () => undefined,
  spawn: () => undefined,
  timer: { every: () => undefined },
};

const stages: SnapshotNoticeStage[] = [];

const recordStage = (name: string): void => {
  stages.push({ name, messageCount: boundaries.snapshotMessages.length });
};

const readStoredState = (): void => {
  readDataState(boundaries.shared, now);
};

const claimScenarioLease = (): Lease => {
  const lease: Lease = { version: 1, owner: 'snapshot-scenario', generation: 1 };

  boundaries.seedShared(leaseKey, lease);
  boundaries.seedShared(heartbeatKey, { ...lease, at: now });

  return lease;
};

const startPublisher = (): PublisherScenario => ({
  lease: claimScenarioLease(),
  publisher: createSnapshotPublisher(boundaries.shared, boundaries.setShared, () => now),
});

const publishOnce = (snapshot: unknown): void => {
  boundaries.seedShared(snapshotKey, snapshot);

  const { lease, publisher } = startPublisher();

  publisher.publish(lease, emptyFacts());
};

const publisherMalformed = (): void => {
  publishOnce(malformedSnapshot);
  recordStage('malformed-published');
};

const publisherNewer = (): void => {
  publishOnce(newerSnapshot);
  recordStage('newer-published');
};

const publisherSilent = (): void => {
  publishOnce(undefined);
  recordStage('absent-published');

  publishOnce(retiredSnapshot);
  recordStage('retired-published');
};

const hostOncePerReason = (): void => {
  readStoredState();
  recordStage('absent');

  boundaries.seedShared(snapshotKey, retiredSnapshot);
  readStoredState();
  readStoredState();
  recordStage('retired');

  boundaries.seedShared(snapshotKey, malformedSnapshot);
  readStoredState();
  readStoredState();
  recordStage('malformed');

  host.startDataHost(hostContext);
  recordStage('malformed-repaired');

  boundaries.clearShared(leaseKey);
  boundaries.clearShared(heartbeatKey);
  boundaries.seedShared(snapshotKey, newerSnapshot);
  readStoredState();
  readStoredState();
  recordStage('newer');

  host.startDataHost(hostContext);
  recordStage('newer-repaired');
};

const scenarioBodies: Record<SnapshotNoticeScenario, () => void> = {
  'host-once-per-reason': hostOncePerReason,
  'publisher-malformed': publisherMalformed,
  'publisher-newer': publisherNewer,
  'publisher-silent': publisherSilent,
};

const scenarioOf = (value: string | undefined): SnapshotNoticeScenario => {
  if (value === undefined || !isSnapshotNoticeScenario(value)) {
    throw new Error(`expected one of ${snapshotNoticeScenarios.join(', ')}`);
  }

  return value;
};

const main = (): void => {
  boundaries.captureConsoleLog();

  scenarioBodies[scenarioOf(process.argv[2])]();

  const record: SnapshotNoticeRecord = {
    messages: boundaries.snapshotMessages,
    stages,
    writes: boundaries.snapshotWrites,
    snapshot: boundaries.shared(snapshotKey),
  };

  process.stdout.write(JSON.stringify(record));
};

if (import.meta.main) {
  main();
}
