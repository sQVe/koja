import { expect, it, onTestFinished } from 'bun:test';

import { paneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { createTerminal } from '../vt/vt.ts';
import type { Connection } from './connection.ts';
import type { PaneRuntime } from './pane.ts';
import { handlePanePaste } from './panePaste.ts';

type PasteResult = Extract<ControlMessage, { type: 'panePasteResult' }>['result'];

interface Fixture {
  context: Parameters<typeof handlePanePaste>[0];
  connection: Connection;
  results: PasteResult[];
  written: Uint8Array[];
}

const id = paneId(1);

const size = { columns: 20, rows: 5 };

const fixture = (generation = 2): Fixture => {
  const created = createTerminal(size.columns, size.rows, 1024 * 1024);

  if (!created.ok) {
    throw new Error(created.reason);
  }

  const { terminal } = created;

  onTestFinished(() => {
    terminal[Symbol.dispose]();
  });

  const results: PasteResult[] = [];
  const written: Uint8Array[] = [];

  const connection = {
    send: (message: ControlMessage) => {
      if (message.type === 'panePasteResult') {
        results.push(message.result);
      }
    },
  } as unknown as Connection;

  const runtime = {
    generation,
    terminal,
    write: (bytes: Uint8Array) => {
      written.push(bytes);
    },
  } as unknown as PaneRuntime;

  const context = {
    state: { panes: [{ id, lifecycle: 'running', size, generation }] },
    runtime: {
      panes: new Map([[id, { runtime }]]),
      pasteSecret: new Uint8Array(32).fill(7),
    },
  } as unknown as Fixture['context'];

  return { context, connection, results, written };
};

const paste = (
  test: Fixture,
  text: string,
  fields: { generation?: number; authorization?: string } = {},
): PasteResult | undefined => {
  handlePanePaste(
    test.context,
    {
      type: 'panePaste',
      paneId: id,
      generation: fields.generation,
      text,
      authorization: fields.authorization,
    },
    test.connection,
  );

  return test.results.at(-1);
};

it('asks to confirm two lines without bracketed paste, and writes nothing', () => {
  const test = fixture();
  const stateBefore = structuredClone(test.context.state);

  const result = paste(test, 'one\ntwo');

  const { authorization, ...fields } =
    result?.kind === 'confirmationRequired' ? result : { authorization: '' };

  expect(fields).toEqual({ kind: 'confirmationRequired', paneId: id, generation: 2, lines: 2 });
  expect(authorization).toMatch(/^2\.[0-9a-f]{64}$/);
  expect(test.written).toEqual([]);
  expect(test.context.state).toEqual(stateBefore);
});

const bracketedPasteOn = '\u001B[?2004h';

const writtenText = (test: Fixture): string[] =>
  test.written.map((bytes) => new TextDecoder().decode(bytes));

const withBracketedPaste = (test: Fixture): Fixture => {
  const record = test.context.runtime.panes.get(id);

  record?.runtime.terminal.write(new TextEncoder().encode(bracketedPasteOn));

  return test;
};

const authorizationFor = (test: Fixture, text: string): string => {
  const asked = paste(test, text);

  return asked?.kind === 'confirmationRequired' ? asked.authorization : '';
};

it('writes one line as it is without bracketed paste or confirmation', () => {
  const test = fixture();

  const result = paste(test, 'echo hi\u001B[201~');

  expect(result).toEqual({ kind: 'sent', paneId: id, generation: 2 });
  expect(writtenText(test)).toEqual(['echo hi\u001B[201~']);
});

it.each([
  ['lines with LF', 'one\ntwo\n', 'one\rtwo\r'],
  ['lines with CRLF', 'one\r\ntwo', 'one\rtwo'],
  ['a lone CR', 'one\rtwo', 'one\rtwo'],
  ['an embedded paste end', 'a\u001B[201~b\nc', 'a\u001B[201~b\rc'],
])('writes confirmed %s with CR line ends without bracketed paste', (_name, text, bytes) => {
  const test = fixture();
  const authorization = authorizationFor(test, text);

  const result = paste(test, text, { authorization });

  expect(result).toEqual({ kind: 'sent', paneId: id, generation: 2 });
  expect(writtenText(test)).toEqual([bytes]);
});

it.each([
  ['one line', 'echo hi', '\u001B[200~echo hi\u001B[201~'],
  ['lines with LF', 'one\ntwo\n', '\u001B[200~one\rtwo\r\u001B[201~'],
  ['lines with CRLF', 'one\r\ntwo', '\u001B[200~one\rtwo\u001B[201~'],
  ['an embedded paste end', 'a\u001B[201~b\u001B[200~c', '\u001B[200~abc\u001B[201~'],
  ['a paste end that removal joins', 'a\u001B[20\u001B[201~1~b', '\u001B[200~ab\u001B[201~'],
])('wraps %s in bracketed paste without asking to confirm', (_name, text, bytes) => {
  const test = withBracketedPaste(fixture());

  const result = paste(test, text);

  expect(result).toEqual({ kind: 'sent', paneId: id, generation: 2 });
  expect(writtenText(test)).toEqual([bytes]);
});

it.each([
  ['a trailing newline', 'one\n', 1],
  ['CRLF line ends', 'one\r\ntwo\r\nthree', 3],
  ['an empty line between', 'one\n\ntwo', 3],
])('counts the lines of text with %s', (_name, text, lines) => {
  const test = fixture();

  const result = paste(test, text);

  expect(result).toMatchObject({ kind: 'confirmationRequired', lines });
  expect(test.written).toEqual([]);
});

it('sends confirmed text with the authorization it got', () => {
  const test = fixture();
  const authorization = authorizationFor(test, 'one\ntwo');

  const result = paste(test, 'one\ntwo', { generation: 2, authorization });

  expect(result).toEqual({ kind: 'sent', paneId: id, generation: 2 });
  expect(writtenText(test)).toEqual(['one\rtwo']);
});

it.each([
  ['other text', (token: string) => ({ text: 'one\nthree', authorization: token })],
  ['an edited digest', (token: string) => ({ text: 'one\ntwo', authorization: `${token}0` })],
  ['another generation', (token: string) => ({ text: 'one\ntwo', authorization: `1${token}` })],
])('refuses an authorization for %s and writes nothing', (_name, request) => {
  const test = fixture();
  const token = authorizationFor(test, 'one\ntwo');
  const { text, authorization } = request(token);

  const result = paste(test, text, { authorization });

  expect(result).toEqual({ kind: 'authorizationMismatch' });
  expect(test.written).toEqual([]);
});

it('refuses an authorization a server with another secret gave the same pane generation', () => {
  const authorization = authorizationFor(fixture(), 'one\ntwo');
  const test = fixture();

  test.context.runtime.pasteSecret = new Uint8Array(32).fill(8);

  const result = paste(test, 'one\ntwo', { authorization });

  expect(result).toEqual({ kind: 'authorizationMismatch' });
  expect(test.written).toEqual([]);
});

it('refuses an authorization given for another pane', () => {
  const test = fixture();
  const other = paneId(2);
  const record = test.context.runtime.panes.get(id);

  if (record === undefined) {
    throw new Error('Missing pane');
  }

  test.context.runtime.panes.set(other, record);

  test.context.state = {
    panes: [...test.context.state.panes, { ...test.context.state.panes[0], id: other }],
  } as unknown as Fixture['context']['state'];

  handlePanePaste(
    test.context,
    {
      type: 'panePaste',
      paneId: other,
      generation: undefined,
      text: 'a\nb',
      authorization: undefined,
    },
    test.connection,
  );

  const asked = test.results.at(-1);
  const authorization = asked?.kind === 'confirmationRequired' ? asked.authorization : '';

  expect(authorization).toMatch(/^2\./);

  const result = paste(test, 'a\nb', { authorization });

  expect(result).toEqual({ kind: 'authorizationMismatch' });
  expect(test.written).toEqual([]);
});

it('answers paneReplaced with the running generation for an older one, and writes nothing', () => {
  const test = fixture(3);
  const stateBefore = structuredClone(test.context.state);

  const result = paste(test, 'echo hi', { generation: 2 });

  expect(result).toEqual({ kind: 'paneReplaced', paneId: id, generation: 3 });
  expect(test.written).toEqual([]);
  expect(test.context.state).toEqual(stateBefore);
});

it.each([
  ['an unknown pane', () => ({ panes: [] })],
  ['a pane that exited', () => ({ panes: [{ id, lifecycle: 'exited', size, generation: 2 }] })],
])('answers paneMissing for %s, and writes nothing', (_name, state) => {
  const test = fixture();

  test.context.state = state() as unknown as Fixture['context']['state'];

  const result = paste(test, 'echo hi');

  expect(result).toEqual({ kind: 'paneMissing', paneId: id });
  expect(test.written).toEqual([]);
});
