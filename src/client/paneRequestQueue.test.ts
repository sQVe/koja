import { afterEach, expect, it, jest, spyOn } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { createPaneRequestQueue } from './paneRequestQueue.ts';

const pane = paneId(1);

const pasteOf = (text: string): Extract<ControlMessage, { type: 'panePaste' }> => ({
  type: 'panePaste',
  paneId: pane,
  generation: 1,
  text,
  authorization: undefined,
});

const scrollMessage: Extract<ControlMessage, { type: 'paneScroll' }> = {
  type: 'paneScroll',
  paneId: pane,
  to: 'bottom',
  clientId: clientId(1),
};

const queueWithLog = () => {
  const sent: ControlMessage[] = [];
  const queue = createPaneRequestQueue({ send: (message) => sent.push(message) });

  return { queue, sent };
};

const isSettled = (promise: Promise<unknown>): boolean => Bun.peek.status(promise) !== 'pending';

afterEach(() => {
  jest.useRealTimers();
});

it('answers pastes in the order they were sent', async () => {
  const { queue, sent } = queueWithLog();
  const first = queue.paste(pasteOf('one'));
  const second = queue.paste(pasteOf('two'));

  expect(sent).toEqual([pasteOf('one'), pasteOf('two')]);

  queue.takeAnswer({
    type: 'panePasteResult',
    result: { kind: 'sent', paneId: pane, generation: 1 },
  });

  queue.takeAnswer({ type: 'panePasteResult', result: { kind: 'authorizationMismatch' } });

  expect(await first).toEqual({ ok: true, paneId: pane, generation: 1 });
  expect(await second).toEqual({ ok: false, reason: 'authorizationMismatch' });
});

it('answers a paste with paneReplaced and the generation that runs now', async () => {
  const { queue } = queueWithLog();
  const pasted = queue.paste(pasteOf('one'));

  queue.takeAnswer({
    type: 'panePasteResult',
    result: { kind: 'paneReplaced', paneId: pane, generation: 2 },
  });

  expect(await pasted).toEqual({ ok: false, reason: 'paneReplaced', paneId: pane, generation: 2 });
});

it('settles only the oldest request of the kind the answer belongs to', () => {
  const { queue, sent } = queueWithLog();
  const layoutOne = queue.changeLayout({ type: 'resync' });
  const layoutTwo = queue.changeLayout({ type: 'resync' });
  const scroll = queue.scroll(scrollMessage);

  const answered = queue.takeAnswer({ type: 'paneDone', paneId: pane });

  expect(answered).toBe(true);

  expect([isSettled(layoutOne), isSettled(layoutTwo), isSettled(scroll)]).toEqual([
    true,
    false,
    false,
  ]);

  expect(sent).toEqual([{ type: 'resync' }, { type: 'resync' }, scrollMessage]);

  queue.takeAnswer({ type: 'paneScrollResult', result: { ok: false, reason: 'unknownPane' } });

  expect([isSettled(layoutTwo), isSettled(scroll)]).toEqual([false, true]);

  queue.takeAnswer({ type: 'paneFailed', reason: 'noSplit', message: undefined });

  expect(isSettled(layoutTwo)).toBe(true);
});

it('leaves messages that answer no pane request to the caller', () => {
  const { queue } = queueWithLog();

  expect(queue.takeAnswer({ type: 'resync' })).toBe(false);
});

it('takes a pane answer that no request waits for', () => {
  const { queue } = queueWithLog();

  const answered = [
    queue.takeAnswer({ type: 'paneDone', paneId: pane }),
    queue.takeAnswer({ type: 'paneScrollResult', result: { ok: false, reason: 'unknownPane' } }),
    queue.takeAnswer({ type: 'panePasteResult', result: { kind: 'authorizationMismatch' } }),
  ];

  expect(answered).toEqual([true, true, true]);
});

it('settles a layout change the server does not answer in time', () => {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);

  const clock = spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_000_000);

  try {
    const { queue } = queueWithLog();
    const layout = queue.changeLayout({ type: 'resync' });

    jest.advanceTimersByTime(1999);
    expect(isSettled(layout)).toBe(false);

    jest.advanceTimersByTime(1);
    expect(isSettled(layout)).toBe(true);
  } finally {
    clock.mockRestore();
  }
});

it('settles waiting requests on close and sends none after it', async () => {
  const { queue, sent } = queueWithLog();
  const paste = queue.paste(pasteOf('one'));
  const layout = queue.changeLayout({ type: 'resync' });
  const scroll = queue.scroll(scrollMessage);

  queue.close();

  expect([isSettled(layout), isSettled(scroll)]).toEqual([true, true]);
  expect(await paste).toEqual({ ok: false, reason: 'connectionFailed' });

  sent.length = 0;

  expect(await queue.paste(pasteOf('two'))).toEqual({ ok: false, reason: 'connectionFailed' });
  await queue.changeLayout({ type: 'resync' });
  await queue.scroll(scrollMessage);
  expect(sent).toEqual([]);
});
