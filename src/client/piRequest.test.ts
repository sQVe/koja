import { expect, it, onTestFinished, spyOn } from 'bun:test';

import { paneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import * as clientRequest from './clientRequest.ts';
import { runPiStatus } from './piRequest.ts';

const version = { version: 'test', ghostty: 'test' };

// Answers the request as a server would: it takes the request after welcome, then sends replies.
const serverReplies = (replies: ControlMessage[]): ControlMessage[] => {
  const sent: ControlMessage[] = [];

  const request = spyOn(clientRequest, 'runRequest').mockImplementation(
    (_socketPath, _version, handlers) =>
      new Promise((resolve) => {
        const fake = {
          send: (message: ControlMessage) => {
            sent.push(message);
          },
          finish: resolve,
        };

        handlers.onWelcome?.(fake);

        for (const reply of replies) {
          handlers.onMessage(fake, reply);
        }
      }),
  );

  onTestFinished(() => {
    request.mockRestore();
  });

  return sent;
};

it('returns the pi status and the restore check of the asked pane', async () => {
  const recovery = { status: 'failed', reason: 'sessionFileMissing' } as const;

  const sent = serverReplies([
    { type: 'piStatusReply', paneId: paneId(2), pi: null, recovery: { status: 'ready' } },
    { type: 'piStatusReply', paneId: paneId(1), pi: null, recovery },
  ]);

  const result = await runPiStatus('/tmp/koja.sock', version, paneId(1));

  expect(sent).toEqual([{ type: 'piStatus', paneId: paneId(1) }]);
  expect(result).toEqual({ ok: true, pi: null, recovery });
});
