import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { ModeFlag } from '../rows/rows.ts';
import type { State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import { findLivePane } from './paneEffects.ts';
import type { LivePane } from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';

interface PanePasteContext {
  state: Pick<State, 'panes'>;
  runtime: {
    panes: Map<PaneId, RunningPane>;
    pasteSecret: Uint8Array;
  };
}

type PanePasteMessage = Extract<ControlMessage, { type: 'panePaste' }>;

type PanePasteResult = Extract<ControlMessage, { type: 'panePasteResult' }>['result'];

const pasteSecretBytes = 32;

const pasteStart = '\u001B[200~';

const pasteEnd = '\u001B[201~';

const textEncoder = new TextEncoder();

export const createPasteSecret = (): Uint8Array => randomBytes(pasteSecretBytes);

const withoutPasteMarkers = (text: string): string => {
  let remaining = text;
  let previous;

  do {
    previous = remaining;
    remaining = remaining.replaceAll(pasteStart, '').replaceAll(pasteEnd, '');
  } while (remaining !== previous);

  return remaining;
};

const withCarriageReturns = (text: string): string => text.replaceAll(/\r?\n/g, '\r');

const encodePaste = (text: string, modes: number): Uint8Array => {
  const normalized = withCarriageReturns(text);

  if ((modes & ModeFlag.bracketedPaste) === 0) {
    return textEncoder.encode(normalized);
  }

  return textEncoder.encode(`${pasteStart}${withoutPasteMarkers(normalized)}${pasteEnd}`);
};

const isMultiline = (text: string): boolean => /[\r\n]/.test(text);

const lineCount = (text: string): number => {
  const normalized = withCarriageReturns(text);
  const returns = normalized.split('\r').length - 1;

  return normalized.endsWith('\r') ? returns : returns + 1;
};

const authorizationDigest = (
  secret: Uint8Array,
  paneId: PaneId,
  generation: number,
  text: string,
): string =>
  createHmac('sha256', secret)
    .update(`${paneId}\u0000${generation}\u0000`)
    .update(text)
    .digest('hex');

const pasteAuthorization = (
  secret: Uint8Array,
  paneId: PaneId,
  generation: number,
  text: string,
): string => `${generation}.${authorizationDigest(secret, paneId, generation, text)}`;

const authorizes = (
  context: PanePasteContext,
  live: LivePane,
  text: string,
  authorization: string,
): boolean => {
  const expected = pasteAuthorization(
    context.runtime.pasteSecret,
    live.pane.id,
    live.pane.generation,
    text,
  );

  const given = Buffer.from(authorization);
  const wanted = Buffer.from(expected);

  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

const needsConfirmation = (live: LivePane, message: PanePasteMessage): boolean => {
  const bracketed = (live.runtime.terminal.modes() & ModeFlag.bracketedPaste) !== 0;

  return isMultiline(message.text) && !bracketed && message.authorization === undefined;
};

const pasteInto = (context: PanePasteContext, message: PanePasteMessage): PanePasteResult => {
  const { paneId, text, authorization } = message;
  const live = findLivePane(context, paneId);

  if (live === undefined) {
    return { kind: 'paneMissing', paneId };
  }

  const { generation } = live.pane;
  const replaced = message.generation !== undefined && message.generation !== generation;

  if (replaced) {
    return { kind: 'paneReplaced', paneId, generation };
  }

  if (authorization !== undefined && !authorizes(context, live, text, authorization)) {
    return { kind: 'authorizationMismatch' };
  }

  if (needsConfirmation(live, message)) {
    return {
      kind: 'confirmationRequired',
      paneId,
      generation,
      lines: lineCount(text),
      authorization: pasteAuthorization(context.runtime.pasteSecret, paneId, generation, text),
    };
  }

  live.runtime.write(encodePaste(text, live.runtime.terminal.modes()));

  return { kind: 'sent', paneId, generation };
};

export const handlePanePaste = (
  context: PanePasteContext,
  message: PanePasteMessage,
  connection: Connection,
): void => {
  connection.send({ type: 'panePasteResult', result: pasteInto(context, message) });
};
