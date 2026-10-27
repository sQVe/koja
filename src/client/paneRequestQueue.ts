import type { ControlMessage } from '../protocol/protocol.ts';
import { pasteResultOf } from './panePaste.ts';
import type { PanePasteResult } from './panePaste.ts';

type PaneScrollMessage = Extract<ControlMessage, { type: 'paneScroll' }>;

type PanePasteMessage = Extract<ControlMessage, { type: 'panePaste' }>;

interface PaneRequestQueueOptions {
  send: (message: ControlMessage) => void;
}

export interface PaneRequestQueue {
  changeLayout: (message: ControlMessage) => Promise<void>;
  scroll: (message: PaneScrollMessage) => Promise<void>;
  paste: (message: PanePasteMessage) => Promise<PanePasteResult>;
  takeAnswer: (message: ControlMessage) => boolean;
  close: () => void;
}

const answerTimeoutMs = 2000;

export const createPaneRequestQueue = (options: PaneRequestQueueOptions): PaneRequestQueue => {
  const layoutAnswers: (() => void)[] = [];
  const scrollAnswers: (() => void)[] = [];
  const pasteAnswers: ((result: PanePasteResult) => void)[] = [];
  let closed = false;

  const requestAnswered = (answers: (() => void)[], message: ControlMessage): Promise<void> => {
    if (closed) {
      return Promise.resolve();
    }

    const answer = Promise.withResolvers<undefined>();

    const timer = setTimeout(() => {
      answer.resolve(undefined);
    }, answerTimeoutMs);

    answers.push(() => {
      clearTimeout(timer);
      answer.resolve(undefined);
    });

    options.send(message);

    return answer.promise;
  };

  return {
    changeLayout: (message) => requestAnswered(layoutAnswers, message),
    scroll: (message) => requestAnswered(scrollAnswers, message),
    paste: (message) => {
      if (closed) {
        return Promise.resolve({ ok: false, reason: 'connectionFailed' });
      }

      const answer = Promise.withResolvers<PanePasteResult>();

      pasteAnswers.push(answer.resolve);
      options.send(message);

      return answer.promise;
    },
    takeAnswer: (message) => {
      if (message.type === 'paneDone' || message.type === 'paneFailed') {
        layoutAnswers.shift()?.();

        return true;
      }

      if (message.type === 'paneScrollResult') {
        scrollAnswers.shift()?.();

        return true;
      }

      if (message.type === 'panePasteResult') {
        pasteAnswers.shift()?.(pasteResultOf(message.result));

        return true;
      }

      return false;
    },
    close: () => {
      closed = true;

      for (const answered of [...layoutAnswers.splice(0), ...scrollAnswers.splice(0)]) {
        answered();
      }

      for (const answered of pasteAnswers.splice(0)) {
        answered({ ok: false, reason: 'connectionFailed' });
      }
    },
  };
};
