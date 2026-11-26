import { describe, expect, test } from 'bun:test';

import {
  ids,
  memoryStore,
  otherRepositoryKey,
  repositoryKey,
  start,
  storedRequests,
} from '../../../tests/pullRetryStore.ts';
import {
  createPullRetryClient,
  pullRetryLifetimeMilliseconds,
  pullRetryOutcomesKey,
  pullRetryRequestsKey,
} from './pullRetry.ts';

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
