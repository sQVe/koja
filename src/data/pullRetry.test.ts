import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Lease, ReadShared } from './lease.ts';
import { claimLease } from './lease.ts';
import type { PullRetryOutcome, PullRetryRequest, PullRetryResult } from './pullRetry.ts';
import {
  answeredRequestKeys,
  createPullRetryClient,
  createPullRetryOutcomesPublisher,
  freshRequests,
  outcomesFor,
  pullRetryLifetimeMilliseconds,
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
  readPullRetryOutcomes,
  readPullRetryRequests,
  requestKey,
} from './pullRetry.ts';
import type { RecordNotices, RecordRejection } from './recordNotices.ts';
import { createRecordNotices } from './recordNotices.ts';

interface OwnerState {
  taken: Set<string>;
  results: Map<string, PullRetryResult>;
}

interface IssuedRequest {
  request: PullRetryRequest;
  expiresAt: number;
}

const repositoryKey = JSON.stringify([null, '/code/koja/.git']);
const otherRepositoryKey = JSON.stringify([null, '/code/other/.git']);

const start = 1_000_000;

const memoryStore = () => {
  const values: Record<string, unknown> = {};
  const writes: string[] = [];

  return {
    values,
    writes,
    read: (key: string): unknown => values[key],
    write: (key: string, value: unknown): void => {
      writes.push(key);
      values[key] = value;
    },
  };
};

type Store = ReturnType<typeof memoryStore>;

const silentNotices = (): RecordNotices => createRecordNotices(() => {});

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8'));

const storeOf =
  (key: string, value: unknown): ReadShared =>
  (readKey: string): unknown =>
    readKey === key ? value : undefined;

const logged = (): { messages: string[]; notices: RecordNotices } => {
  const messages: string[] = [];

  const notices = createRecordNotices((message) => {
    messages.push(message);
  });

  return { messages, notices };
};

const noticeFor = (
  record: 'pullRetryRequests' | 'pullRetryOutcomes',
  rejection: RecordRejection,
): string => {
  const { messages, notices } = logged();

  notices.report(record, rejection);

  const [message] = messages;

  if (message === undefined) {
    throw new Error(`the ${record} reporter logged no ${rejection} notice`);
  }

  return message;
};

const storedRequests = (store: Store): PullRetryRequest[] => {
  const stored = readPullRetryRequests(store.read, silentNotices());

  if (stored.kind !== 'current') {
    throw new Error('the store holds a newer request record');
  }

  return stored.items;
};

const storedOutcomes = (store: Store): PullRetryOutcome[] => {
  const stored = readPullRetryOutcomes(store.read, silentNotices());

  if (stored.kind !== 'current') {
    throw new Error('the store holds a newer outcome record');
  }

  return stored.items;
};

const ids = (prefix: string): (() => string) => {
  let next = 0;

  return () => {
    next += 1;

    return `${prefix}-${next}`;
  };
};

const requestFor = (consumer: string, id: string, at: number): PullRetryRequest => ({
  consumer,
  id,
  repository: repositoryKey,
  at,
});

describe('createPullRetryClient', () => {
  test('two clients keep both requests for one repository', () => {
    const store = memoryStore();
    const clientA = createPullRetryClient(store, 'window-a', ids('a'));
    const clientB = createPullRetryClient(store, 'window-b', ids('b'));

    clientA.request(repositoryKey, start);
    clientB.request(repositoryKey, start);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
      { consumer: 'window-b', id: 'b-1', repository: repositoryKey, at: start },
    ]);
  });

  test('a client re-asserts a request another writer dropped', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));

    client.request(repositoryKey, start);
    store.values[pullRetryRequestsKey] = { version: 1, requests: [] };
    client.settle(start);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
    ]);
  });

  test('an answered request leaves pending and the key', () => {
    const store = memoryStore();
    const clientA = createPullRetryClient(store, 'window-a', ids('a'));
    const clientB = createPullRetryClient(store, 'window-b', ids('b'));

    clientA.request(repositoryKey, start);
    clientB.request(repositoryKey, start);

    store.values[pullRetryOutcomesKey] = {
      version: 1,
      outcomes: [{ consumer: 'window-a', id: 'a-1', result: 'read' }],
    };

    clientA.settle(start);

    expect(clientA.pending(repositoryKey, start)).toBe(false);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-b', id: 'b-1', repository: repositoryKey, at: start },
    ]);
  });

  test('an outcome for another consumer with the same id does not settle this client', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));

    client.request(repositoryKey, start);

    store.values[pullRetryOutcomesKey] = {
      version: 1,
      outcomes: [{ consumer: 'window-b', id: 'a-1', result: 'read' }],
    };

    client.settle(start);

    expect(client.pending(repositoryKey, start)).toBe(true);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
    ]);
  });

  test('two clients settling repeatedly write once and then nothing', () => {
    const store = memoryStore();
    const clientA = createPullRetryClient(store, 'window-a', ids('a'));
    const clientB = createPullRetryClient(store, 'window-b', ids('b'));

    clientA.request(repositoryKey, start);
    clientB.request(repositoryKey, start);

    store.values[pullRetryRequestsKey] = {
      version: 1,
      requests: [{ consumer: 'window-b', id: 'b-1', repository: repositoryKey, at: start }],
    };

    store.writes.length = 0;

    clientA.settle(start + 1);
    clientB.settle(start + 1);

    for (let tick = 2; tick <= 5; tick += 1) {
      clientA.settle(start + tick);
      clientB.settle(start + tick);
    }

    expect(store.writes).toEqual([pullRetryRequestsKey]);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-b', id: 'b-1', repository: repositoryKey, at: start },
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
    ]);
  });

  test('a stored list with duplicates stays as it is', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));
    const request = { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start };

    client.request(repositoryKey, start);
    store.values[pullRetryRequestsKey] = { version: 1, requests: [request, request] };
    store.writes.length = 0;

    client.settle(start);

    expect(store.writes).toEqual([]);
  });

  test('a request does nothing while one is pending for that repository', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));

    client.request(repositoryKey, start);
    store.writes.length = 0;
    client.request(repositoryKey, start + 1);

    expect(store.writes).toEqual([]);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
    ]);
  });

  test('a request for another repository is written while one is pending', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));

    client.request(repositoryKey, start);
    client.request(otherRepositoryKey, start);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
      { consumer: 'window-a', id: 'a-2', repository: otherRepositoryKey, at: start },
    ]);
  });

  test('an expired request is dropped', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));
    const expired = start + pullRetryLifetimeMilliseconds;

    client.request(repositoryKey, start);

    expect(client.pending(repositoryKey, expired)).toBe(false);

    client.settle(expired);

    expect(store.values[pullRetryRequestsKey]).toEqual({ version: 1, requests: [] });
  });

  test('a newer outcomes record keeps pending requests and the record', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));
    const newer = { version: 2, outcomes: [] };

    store.values[pullRetryOutcomesKey] = newer;

    store.writes.length = 0;

    client.request(repositoryKey, start);

    expect(client.pending(repositoryKey, start)).toBe(true);
    expect(store.values[pullRetryOutcomesKey]).toEqual(newer);

    expect(storedRequests(store)).toEqual([
      { consumer: 'window-a', id: 'a-1', repository: repositoryKey, at: start },
    ]);
  });

  test('a client writes nothing over a newer request record', () => {
    const store = memoryStore();
    const client = createPullRetryClient(store, 'window-a', ids('a'));
    const newer = { version: 2, requests: [] };

    store.values[pullRetryRequestsKey] = newer;
    store.writes.length = 0;

    client.request(repositoryKey, start);

    expect(store.writes).toEqual([]);
    expect(store.values[pullRetryRequestsKey]).toEqual(newer);
  });
});

describe('owner helpers', () => {
  test('answeredRequestKeys reads the stored outcome keys', () => {
    const store = memoryStore();
    const first: PullRetryOutcome = { consumer: 'window-a', id: 'a-1', result: 'read' };
    const second: PullRetryOutcome = { consumer: 'window-b', id: 'b-1', result: 'failed' };

    store.values[pullRetryOutcomesKey] = { version: 1, outcomes: [first, second] };

    expect(answeredRequestKeys(store.read)).toEqual(
      new Set([requestKey(first), requestKey(second)]),
    );
  });

  test('answeredRequestKeys is empty for a newer outcomes record', () => {
    const store = memoryStore();

    store.values[pullRetryOutcomesKey] = { version: 2, outcomes: [] };

    expect(answeredRequestKeys(store.read)).toEqual(new Set());
  });

  test('freshRequests skips taken and expired requests', () => {
    const fresh = requestFor('window-a', 'a-1', start);
    const taken = requestFor('window-b', 'b-1', start);
    const expired = requestFor('window-c', 'c-1', start - pullRetryLifetimeMilliseconds);

    expect(freshRequests([fresh, taken, expired], new Set([requestKey(taken)]), start)).toEqual([
      fresh,
    ]);
  });

  test('outcomesFor answers only present, unexpired, answered requests', () => {
    const first = requestFor('window-a', 'a-1', start);
    const second = requestFor('window-b', 'b-1', start);
    const unanswered = requestFor('window-d', 'd-1', start);
    const expired = requestFor('window-c', 'c-1', start - pullRetryLifetimeMilliseconds);

    const answers = new Map([
      [requestKey(first), 'read'],
      [requestKey(second), 'failed'],
      [requestKey(expired), 'read'],
    ] as const);

    expect(outcomesFor([first, expired], answers, start)).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
    ]);

    expect(outcomesFor([first, expired, second, unanswered], answers, start)).toEqual([
      { consumer: 'window-a', id: 'a-1', result: 'read' },
      { consumer: 'window-b', id: 'b-1', result: 'failed' },
    ]);
  });
});

describe('readPullRetryRequests', () => {
  const requestId = '0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  test('reads the version 1 fixture', () => {
    const { messages, notices } = logged();

    const stored = readPullRetryRequests(
      storeOf(pullRetryRequestsKey, fixture('pull-retry-requests-v1.json')),
      notices,
    );

    expect(stored).toEqual({
      kind: 'current',
      items: [
        { consumer: 'window-a', id: requestId, repository: repositoryKey, at: 1_700_000_000_000 },
      ],
    });

    expect(messages).toEqual([]);
  });

  test('ignores the version 2 fixture with the newer notice once', () => {
    const { messages, notices } = logged();
    const read = storeOf(pullRetryRequestsKey, fixture('pull-retry-requests-v2.json'));

    expect(readPullRetryRequests(read, notices)).toEqual({ kind: 'newer' });
    expect(readPullRetryRequests(read, notices)).toEqual({ kind: 'newer' });
    expect(messages).toEqual([noticeFor('pullRetryRequests', 'newer')]);
  });

  const validRequest = {
    consumer: 'window-a',
    id: requestId,
    repository: repositoryKey,
    at: start,
  };

  const malformedRequests: [string, unknown][] = [
    ['a request with an extra key', { version: 1, requests: [{ ...validRequest, extra: true }] }],
    [
      'a request with a non-string consumer',
      { version: 1, requests: [{ ...validRequest, consumer: 1 }] },
    ],
    [
      'a request without at',
      {
        version: 1,
        requests: [{ consumer: 'window-a', id: requestId, repository: repositoryKey }],
      },
    ],
    ['a record with another version', { version: 0, requests: [] }],
    ['requests that are not an array', { version: 1, requests: {} }],
  ];

  for (const [name, stored] of malformedRequests) {
    test(`ignores ${name} with the malformed notice`, () => {
      const { messages, notices } = logged();

      expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, stored), notices)).toEqual({
        kind: 'current',
        items: [],
      });

      expect(messages).toEqual([noticeFor('pullRetryRequests', 'malformed')]);
    });
  }

  test('treats a null record as absent', () => {
    const { messages, notices } = logged();

    expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, null), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });

  test('stays silent for an absent record', () => {
    const { messages, notices } = logged();

    expect(readPullRetryRequests(storeOf(pullRetryRequestsKey, undefined), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });
});

describe('readPullRetryOutcomes', () => {
  const requestId = '0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  test('reads the version 1 fixture', () => {
    const { messages, notices } = logged();

    const stored = readPullRetryOutcomes(
      storeOf(pullRetryOutcomesKey, fixture('pull-retry-outcomes-v1.json')),
      notices,
    );

    expect(stored).toEqual({
      kind: 'current',
      items: [{ consumer: 'window-a', id: requestId, result: 'read' }],
    });

    expect(messages).toEqual([]);
  });

  test('ignores the version 2 fixture with the newer notice once', () => {
    const { messages, notices } = logged();
    const read = storeOf(pullRetryOutcomesKey, fixture('pull-retry-outcomes-v2.json'));

    expect(readPullRetryOutcomes(read, notices)).toEqual({ kind: 'newer' });
    expect(readPullRetryOutcomes(read, notices)).toEqual({ kind: 'newer' });
    expect(messages).toEqual([noticeFor('pullRetryOutcomes', 'newer')]);
  });

  const validOutcome = { consumer: 'window-a', id: requestId, result: 'read' };

  const malformedOutcomes: [string, unknown][] = [
    ['an outcome with an extra key', { version: 1, outcomes: [{ ...validOutcome, extra: true }] }],
    ['an outcome with a non-string id', { version: 1, outcomes: [{ ...validOutcome, id: 1 }] }],
    [
      'an outcome without a result',
      { version: 1, outcomes: [{ consumer: 'window-a', id: requestId }] },
    ],
    ['an unknown result', { version: 1, outcomes: [{ ...validOutcome, result: 'maybe' }] }],
    ['a record with another version', { version: 0, outcomes: [] }],
    ['outcomes that are not an array', { version: 1, outcomes: {} }],
  ];

  for (const [name, stored] of malformedOutcomes) {
    test(`ignores ${name} with the malformed notice`, () => {
      const { messages, notices } = logged();

      expect(readPullRetryOutcomes(storeOf(pullRetryOutcomesKey, stored), notices)).toEqual({
        kind: 'current',
        items: [],
      });

      expect(messages).toEqual([noticeFor('pullRetryOutcomes', 'malformed')]);
    });
  }

  test('treats a null record as absent', () => {
    const { messages, notices } = logged();

    expect(readPullRetryOutcomes(storeOf(pullRetryOutcomesKey, null), notices)).toEqual({
      kind: 'current',
      items: [],
    });

    expect(messages).toEqual([]);
  });
});

describe('createPullRetryOutcomesPublisher', () => {
  const outcome: PullRetryOutcome = { consumer: 'window-a', id: 'a-1', result: 'read' };

  const claimFor = (store: Store, owner: string): Lease => {
    const lease = claimLease(store.read, store.write, owner, start);

    if (lease === null) {
      throw new Error(`${owner} could not claim the lease`);
    }

    store.writes.length = 0;

    return lease;
  };

  test('writes nothing without the lease', () => {
    const store = memoryStore();

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(
      { version: 1, owner: 'window-a', generation: 1 },
      [outcome],
    );

    expect(store.writes).toEqual([]);
  });

  test('writes nothing for equal outcomes', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');

    store.values[pullRetryOutcomesKey] = { version: 1, outcomes: [outcome] };

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.writes).toEqual([]);
  });

  test('writes nothing over a newer outcomes record', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');
    const newer = { version: 2, outcomes: [] };

    store.values[pullRetryOutcomesKey] = newer;

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.writes).toEqual([]);
    expect(store.values[pullRetryOutcomesKey]).toEqual(newer);
  });

  test('writes the outcomes when the stored record differs', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.values[pullRetryOutcomesKey]).toEqual({ version: 1, outcomes: [outcome] });
  });
});

const seededRandom = (seed: number): (() => number) => {
  let state = seed + 1;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const newOwner = (): OwnerState => ({ taken: new Set(), results: new Map() });

const observeRequests = (
  requests: PullRetryRequest[],
  issued: Map<string, IssuedRequest>,
): void => {
  for (const request of requests) {
    issued.set(requestKey(request), {
      request,
      expiresAt: request.at + pullRetryLifetimeMilliseconds,
    });
  }
};

const answerWithOwner = (
  store: Store,
  owner: OwnerState,
  now: number,
  random: () => number,
  issued: Map<string, IssuedRequest>,
  answerCounts: Map<string, number>,
): void => {
  const stored = readPullRetryRequests(store.read, silentNotices());

  if (stored.kind !== 'current') {
    return;
  }

  observeRequests(stored.items, issued);

  const taken = new Set([...answeredRequestKeys(store.read), ...owner.taken]);

  for (const request of freshRequests(stored.items, taken, now)) {
    const key = requestKey(request);
    const result: PullRetryResult = random() < 0.5 ? 'read' : 'failed';

    owner.taken.add(key);
    owner.results.set(key, result);
    answerCounts.set(key, (answerCounts.get(key) ?? 0) + 1);
  }

  const existing = storedOutcomes(store);
  const outcomes = new Map(existing.map((outcome) => [requestKey(outcome), outcome]));

  for (const outcome of outcomesFor(stored.items, owner.results, now)) {
    outcomes.set(requestKey(outcome), outcome);
  }

  store.write(pullRetryOutcomesKey, { version: 1, outcomes: [...outcomes.values()] });
};

const checkInterleaving = (seed: number): void => {
  const random = seededRandom(seed);
  const store = memoryStore();
  const clientA = createPullRetryClient(store, 'window-a', ids(`a${seed}`));
  const clientB = createPullRetryClient(store, 'window-b', ids(`b${seed}`));
  const issued = new Map<string, IssuedRequest>();
  const answerCounts = new Map<string, number>();
  const steps = 6 + Math.floor(random() * 10);
  let owner = newOwner();
  let now = start;

  for (let step = 0; step < steps; step += 1) {
    const jump =
      random() < 0.2
        ? Math.floor(random() * 3 * pullRetryLifetimeMilliseconds)
        : Math.floor(random() * 4_000);

    now += jump;

    const action = Math.floor(random() * 6);
    const repository = random() < 0.5 ? repositoryKey : otherRepositoryKey;

    if (action === 0) {
      clientA.request(repository, now);
    } else if (action === 1) {
      clientB.request(repository, now);
    } else if (action === 2) {
      clientA.settle(now);
    } else if (action === 3) {
      clientB.settle(now);
    } else if (action === 4) {
      store.write(pullRetryRequestsKey, { version: 1, requests: [] });
    } else {
      if (random() < 0.4) {
        owner = newOwner();
      }

      answerWithOwner(store, owner, now, random, issued, answerCounts);
    }

    observeRequests(storedRequests(store), issued);
  }

  clientA.settle(now);
  clientB.settle(now);

  const stored = storedRequests(store);
  const outcomes = storedOutcomes(store);
  const answered = new Set(outcomes.map(requestKey));
  const storedKeys = new Set(stored.map(requestKey));

  for (const request of stored) {
    const key = requestKey(request);

    expect(answered.has(key), `seed ${seed}: the answered request ${key} stays in the key`).toBe(
      false,
    );

    expect(
      request.at + pullRetryLifetimeMilliseconds > now,
      `seed ${seed}: the expired request ${key} stays in the key`,
    ).toBe(true);
  }

  for (const [key, count] of answerCounts) {
    expect(count, `seed ${seed}: the owner answered ${key} ${count} times`).toBe(1);
  }

  for (const [key, entry] of issued) {
    if (entry.expiresAt <= now || answered.has(key)) {
      continue;
    }

    expect(
      storedKeys.has(key),
      `seed ${seed}: the unexpired unanswered request ${key} left the key`,
    ).toBe(true);
  }
};

describe('client interleavings', () => {
  test('a final settle keeps every live pending request and drops answered ones', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      checkInterleaving(seed);
    }
  });
});
