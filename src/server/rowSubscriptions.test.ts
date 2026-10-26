import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, createState } from '../store/store.ts';
import type { Intent, State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { RunningPane } from './paneRecord.ts';
import { scheduleRows, subscribeRows, visiblePaneIds } from './rowSubscriptions.ts';
import type { RowSubscriptions } from './rowSubscriptions.ts';

interface Recorded {
  runningPane: RunningPane;
  published: number;
  subscribed: number;
}

const id = paneId(1);

const record = (generation: number): Recorded => {
  const recorded = { published: 0, subscribed: 0 } as Recorded;

  recorded.runningPane = {
    reportPass: 'a'.repeat(64),
    runtime: { generation } as unknown as RunningPane['runtime'],
    publication: {
      pending: false,
      publisher: {
        publish: () => {
          recorded.published += 1;
        },
        subscribe: () => {
          recorded.subscribed += 1;

          return { acknowledge: () => true, unsubscribe: () => {} };
        },
      } as unknown as RunningPane['publication']['publisher'],
    },
  };

  return recorded;
};

const turn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const publicationContext = (panes: Map<PaneId, RunningPane>, stopping = false) => ({
  options: { log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } },
  state: { stopping },
  runtime: { panes },
});

it('publishes the rows of a pane once for any number of requests in a turn', async () => {
  const recorded = record(1);
  const context = publicationContext(new Map([[id, recorded.runningPane]]));

  scheduleRows(context, id, 1);
  scheduleRows(context, id, 1);
  expect(recorded.published).toBe(0);

  await turn();
  scheduleRows(context, id, 1);
  await turn();

  expect(recorded.published).toBe(2);
});

it('publishes nothing for a pane that has no record', async () => {
  const recorded = record(1);
  const context = publicationContext(new Map([[id, recorded.runningPane]]));

  scheduleRows(context, paneId(2), 1);
  await turn();

  expect(recorded.published).toBe(0);
});

it('publishes nothing while the server stops', async () => {
  const recorded = record(1);
  const panes = new Map([[id, recorded.runningPane]]);
  const context = publicationContext(panes);

  scheduleRows(context, id, 1);
  context.state.stopping = true;
  await turn();

  expect(recorded.published).toBe(0);

  scheduleRows(context, id, 1);
  await turn();

  expect(recorded.published).toBe(0);
});

it('publishes nothing when the pane was replaced or released before the turn', async () => {
  const first = record(1);
  const replacement = record(2);
  const panes = new Map([[id, first.runningPane]]);
  const context = publicationContext(panes);

  scheduleRows(context, id, 1);
  panes.set(id, replacement.runningPane);
  await turn();

  scheduleRows(context, id, 2);
  panes.delete(id);
  await turn();

  expect(first.published).toBe(0);
  expect(replacement.published).toBe(0);
});

const connection = { isClosed: () => false } as unknown as Connection;

it('subscribes to each pane that has a record and publishes its full rows', async () => {
  const recorded = record(1);
  const panes = new Map([[id, recorded.runningPane]]);
  const context = publicationContext(panes) as unknown as Parameters<typeof subscribeRows>[0];

  const subscriptions: RowSubscriptions = subscribeRows(context, connection, [id, paneId(2)]);

  await turn();

  expect(recorded.subscribed).toBe(1);
  expect(recorded.published).toBe(1);
  expect(subscriptions.acknowledge(id, 1)).toBe(true);
  expect(subscriptions.acknowledge(paneId(2), 1)).toBe(false);
});

const run = (intents: readonly Intent[]): State =>
  intents.reduce((state, intent) => {
    const result = applyIntent(state, intent);

    invariant(result.kind === 'applied', 'An intent was refused.');

    return result.state;
  }, createState());

const splitState = (): State =>
  run([
    { type: 'attachClient', size: { columns: 80, rows: 24 } },
    { type: 'createWorkspace', root: '/work', label: 'work', focus: true },
    { type: 'splitPane', paneId: id, direction: 'right', folder: undefined },
  ]);

it('lists the visible panes that have a record', () => {
  const state = splitState();
  const both = new Map([id, paneId(2)].map((known) => [known, record(1).runningPane]));
  const onlyFirst = new Map([[id, record(1).runningPane]]);

  const contextOf = (panes: Map<PaneId, RunningPane>) =>
    ({
      ...publicationContext(panes),
      state,
      runtime: { panes, clientIds: new Map(), rowSubscriptions: new Map() },
    }) as Parameters<typeof visiblePaneIds>[0];

  expect(visiblePaneIds(contextOf(both), connection).toSorted()).toEqual([id, paneId(2)]);
  expect(visiblePaneIds(contextOf(onlyFirst), connection)).toEqual([id]);
});
