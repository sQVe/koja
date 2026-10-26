import type { PaneId } from '../ids.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { runRequest } from './clientRequest.ts';
import type { RequestFailure } from './clientRequest.ts';

export type PiReportMessage = Extract<ControlMessage, { type: 'piReport' }>;

export type PiReportResult = Extract<ControlMessage, { type: 'piReportResult' }>['result'];

export type PiStatus = Extract<ControlMessage, { type: 'piStatusReply' }>['pi'];

type PiStatusResult = { ok: true; pi: PiStatus } | { ok: false; reason: 'unknownPane' };

export const runPiReport = (
  socketPath: string,
  version: BuildVersion,
  report: PiReportMessage,
): Promise<{ ok: true; result: PiReportResult } | RequestFailure> =>
  runRequest<{ ok: true; result: PiReportResult }>(socketPath, version, {
    onWelcome: (request) => {
      request.send(report);
    },
    onMessage: (request, message) => {
      if (message.type === 'piReportResult') {
        request.finish({ ok: true, result: message.result });
      }
    },
  });

export const runPiStatus = (
  socketPath: string,
  version: BuildVersion,
  paneId: PaneId,
): Promise<PiStatusResult | RequestFailure> =>
  runRequest<PiStatusResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({ type: 'piStatus', paneId });
    },
    onMessage: (request, message) => {
      if (message.type === 'piStatusReply' && message.paneId === paneId) {
        request.finish({ ok: true, pi: message.pi });
      }

      if (message.type === 'paneFailed' && message.reason === 'unknownPane') {
        request.finish({ ok: false, reason: 'unknownPane' });
      }
    },
  });
