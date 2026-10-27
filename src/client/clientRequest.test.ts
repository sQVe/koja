import { expect, it } from 'bun:test';

import { encodeControl, FrameKind } from '../protocol/protocol.ts';
import { stopReplyIn } from './clientRequest.ts';

const controlFrame = (message: Parameters<typeof encodeControl>[0]) => ({
  kind: FrameKind.control,
  payload: encodeControl(message),
});

it('reads the stop result from a stop connection', () => {
  expect(stopReplyIn([controlFrame({ type: 'stopResult', result: { ok: true } })])).toEqual({
    ok: true,
  });

  expect(
    stopReplyIn([
      controlFrame({ type: 'stopResult', result: { ok: false, message: 'Cannot save.' } }),
    ]),
  ).toEqual({ ok: false, message: 'Cannot save.' });
});

it('reads the stop result after other frames', () => {
  const reply = controlFrame({
    type: 'stopResult',
    result: { ok: false, message: 'Cannot save.' },
  });

  expect(stopReplyIn([controlFrame({ type: 'stop' }), reply])).toEqual({
    ok: false,
    message: 'Cannot save.',
  });
});

it('ignores frames that are not a stop result', () => {
  const stopResultBytes = encodeControl({
    type: 'stopResult',
    result: { ok: false, message: 'x' },
  });

  const rowFrame = { kind: FrameKind.rowUpdate, payload: stopResultBytes };

  expect(stopReplyIn([controlFrame({ type: 'stop' }), rowFrame])).toBeUndefined();
});
