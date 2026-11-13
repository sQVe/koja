import { recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';

export interface Lease {
  version: 1;
  owner: string;
  generation: number;
}

export interface Heartbeat extends Lease {
  at: number;
}

export type ReadShared = (key: string) => unknown;
export type WriteShared = (key: string, value: unknown) => void;

export const leaseKey = 'koja.data.v1.lease';
export const heartbeatKey = 'koja.data.v1.heartbeat';
export const leaseExpiryMilliseconds = 30_000;
export const heartbeatIntervalMilliseconds = 10_000;

const isOwner = (value: unknown): value is string => typeof value === 'string' && value !== '';

export const parseLease = (value: unknown): Lease | null => {
  const fields = recordOf(value);

  if (fields.version !== 1) {
    return null;
  }

  if (!isOwner(fields.owner)) {
    return null;
  }

  if (!isPositiveWholeNumber(fields.generation)) {
    return null;
  }

  return { version: 1, owner: fields.owner, generation: fields.generation };
};

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const parseHeartbeat = (value: unknown): Heartbeat | null => {
  const lease = parseLease(value);

  if (lease === null) {
    return null;
  }

  const at = recordOf(value).at;

  if (!isTime(at)) {
    return null;
  }

  return { ...lease, at };
};

export const heartbeatDeadline = (heartbeat: Heartbeat): number =>
  heartbeat.at + leaseExpiryMilliseconds;

const sameHolder = (first: Lease, second: Lease): boolean =>
  first.owner === second.owner && first.generation === second.generation;

const liveLease = (read: ReadShared, now: number): Lease | null => {
  const lease = parseLease(read(leaseKey));
  const heartbeat = parseHeartbeat(read(heartbeatKey));

  if (lease === null || heartbeat === null) {
    return null;
  }

  if (!sameHolder(lease, heartbeat)) {
    return null;
  }

  if (now >= heartbeatDeadline(heartbeat)) {
    return null;
  }

  return lease;
};

export const holdsLease = (read: ReadShared, lease: Lease, now: number): boolean => {
  const live = liveLease(read, now);

  return live !== null && sameHolder(live, lease);
};

const writeHeartbeat = (write: WriteShared, lease: Lease, now: number): void => {
  const heartbeat: Heartbeat = { ...lease, at: now };

  write(heartbeatKey, heartbeat);
};

export const claimLease = (
  read: ReadShared,
  write: WriteShared,
  owner: string,
  now: number,
): Lease | null => {
  const live = liveLease(read, now);

  if (live !== null) {
    return live.owner === owner ? live : null;
  }

  const stored = parseLease(read(leaseKey));
  const generation = (stored?.generation ?? 0) + 1;
  const lease: Lease = { version: 1, owner, generation };

  write(leaseKey, lease);
  writeHeartbeat(write, lease, now);

  return holdsLease(read, lease, now) ? lease : null;
};

export const renewHeartbeat = (
  read: ReadShared,
  write: WriteShared,
  lease: Lease,
  now: number,
): boolean => {
  if (!holdsLease(read, lease, now)) {
    return false;
  }

  writeHeartbeat(write, lease, now);

  return true;
};
