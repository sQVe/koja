import type { Lease, ReadShared } from '../lease.ts';
import type { RecordNotices } from '../recordNotices.ts';
import type { PullRetryOutcome, PullRetryRequest, PullRetryResult } from './pullRetry.ts';
import {
  isExpired,
  readPullRetryOutcomes,
  readPullRetryRequests,
  requestKey,
} from './pullRetry.ts';

export interface PullRetrySession {
  claim: (now: number) => PullRetryRequest[];
  complete: (request: PullRetryRequest, result: PullRetryResult) => void;
  completeRead: (repository: string, result: PullRetryResult, now: number) => void;
  publish: (now: number) => void;
}

export interface PullRetrySessionDependencies {
  read: ReadShared;
  notices: RecordNotices;
  lease: Lease;
  publishOutcomes: (lease: Lease, outcomes: PullRetryOutcome[]) => void;
}

type PullRetryEntry =
  | { kind: 'claimed'; request: PullRetryRequest }
  | { kind: 'answered'; request: PullRetryRequest; result: PullRetryResult };

type PullRetryView = { kind: 'current'; requests: PullRetryRequest[] } | { kind: 'newer' };

type PullRetryLedger = Map<string, PullRetryEntry>;

const adoptOutcomes = (
  ledger: PullRetryLedger,
  requests: PullRetryRequest[],
  outcomes: PullRetryOutcome[],
  now: number,
): void => {
  const live = new Map<string, PullRetryRequest>();

  for (const request of requests) {
    const key = requestKey(request);

    if (!isExpired(request.at, now) && !live.has(key)) {
      live.set(key, request);
    }
  }

  for (const outcome of outcomes) {
    const key = requestKey(outcome);
    const request = live.get(key);

    if (request === undefined || ledger.has(key)) {
      continue;
    }

    ledger.set(key, { kind: 'answered', request, result: outcome.result });
  }
};

const completeRequest = (
  ledger: PullRetryLedger,
  request: PullRetryRequest,
  result: PullRetryResult,
): void => {
  ledger.set(requestKey(request), { kind: 'answered', request, result });
};

const dropExpired = (ledger: PullRetryLedger, now: number): void => {
  for (const [key, entry] of ledger) {
    if (isExpired(entry.request.at, now)) {
      ledger.delete(key);
    }
  }
};

const claimRequests = (
  ledger: PullRetryLedger,
  requests: PullRetryRequest[],
  now: number,
): PullRetryRequest[] => {
  const claims: PullRetryRequest[] = [];

  for (const request of requests) {
    const key = requestKey(request);

    if (isExpired(request.at, now) || ledger.has(key)) {
      continue;
    }

    ledger.set(key, { kind: 'claimed', request });
    claims.push(request);
  }

  return claims;
};

const completeClaims = (
  ledger: PullRetryLedger,
  repository: string,
  result: PullRetryResult,
): void => {
  const claims: PullRetryRequest[] = [];

  for (const entry of ledger.values()) {
    if (entry.kind === 'claimed' && entry.request.repository === repository) {
      claims.push(entry.request);
    }
  }

  for (const request of claims) {
    completeRequest(ledger, request, result);
  }
};

const answerLateRequests = (
  ledger: PullRetryLedger,
  repository: string,
  result: PullRetryResult,
  requests: PullRetryRequest[],
  now: number,
): void => {
  for (const request of requests) {
    if (request.repository !== repository || isExpired(request.at, now)) {
      continue;
    }

    if (!ledger.has(requestKey(request))) {
      completeRequest(ledger, request, result);
    }
  }
};

const outcomesFor = (
  ledger: PullRetryLedger,
  requests: PullRetryRequest[],
  now: number,
): PullRetryOutcome[] => {
  const outcomes: PullRetryOutcome[] = [];

  for (const request of requests) {
    if (isExpired(request.at, now)) {
      continue;
    }

    const entry = ledger.get(requestKey(request));

    if (entry?.kind === 'answered') {
      outcomes.push({ consumer: request.consumer, id: request.id, result: entry.result });
    }
  }

  return outcomes;
};

export const createPullRetrySession = (
  dependencies: PullRetrySessionDependencies,
): PullRetrySession => {
  const ledger: PullRetryLedger = new Map();

  // A record from a newer version keeps the ledger as it is and stops every write.
  const load = (now: number): PullRetryView => {
    const requests = readPullRetryRequests(dependencies.read, dependencies.notices);
    const outcomes = readPullRetryOutcomes(dependencies.read, dependencies.notices);

    if (requests.kind === 'newer' || outcomes.kind === 'newer') {
      return { kind: 'newer' };
    }

    adoptOutcomes(ledger, requests.items, outcomes.items, now);

    return { kind: 'current', requests: requests.items };
  };

  return {
    claim: (now) => {
      const view = load(now);

      if (view.kind === 'newer') {
        return [];
      }

      dropExpired(ledger, now);

      return claimRequests(ledger, view.requests, now);
    },

    complete: (request, result) => {
      completeRequest(ledger, request, result);
    },

    // A finished read answers the claims it served, then any request written while it ran.
    completeRead: (repository, result, now) => {
      completeClaims(ledger, repository, result);

      const view = load(now);

      if (view.kind === 'current') {
        answerLateRequests(ledger, repository, result, view.requests, now);
      }
    },

    publish: (now) => {
      const view = load(now);

      if (view.kind !== 'current') {
        return;
      }

      dependencies.publishOutcomes(dependencies.lease, outcomesFor(ledger, view.requests, now));
    },
  };
};
