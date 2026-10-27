import { expect, it } from 'bun:test';

import { stopVerdictOf } from './serverStop.ts';

const socketPath = '/run/koja/koja.sock';

it('reports the server message when the server stopped but its reply fails', () => {
  const verdict = stopVerdictOf(socketPath, 'removed', {
    ok: false,
    message: 'Cannot save the session to a file.',
  });

  expect(verdict).toEqual({ ok: false, message: 'Cannot save the session to a file.' });
});

// A server of an older build sends no stopResult, and the stop reads as an ok reply.
it('reports success when the socket is removed and the reply is ok', () => {
  expect(stopVerdictOf(socketPath, 'removed', { ok: true })).toEqual({ ok: true });
});

it('reports that the server did not stop when it never released the socket', () => {
  const verdict = stopVerdictOf(socketPath, undefined, { ok: true });

  expect(verdict).toEqual({
    ok: false,
    message: `The server on ${socketPath} did not stop within 10 seconds.`,
  });
});

it('reports the socket left behind even when the reply is ok', () => {
  const verdict = stopVerdictOf(socketPath, 'leftSocket', { ok: true });

  expect(verdict).toEqual({
    ok: false,
    message: `The server stopped, but left its socket at ${socketPath}. The next start removes it.`,
  });
});
