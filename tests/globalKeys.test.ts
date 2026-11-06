import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

interface Keys {
  global: Record<string, string>;
  terminal: Record<string, string>;
}

const allowedGlobalKeys = ['ctrl-b'];

const allowedTerminalKeys = [
  'ctrl-backspace',
  'ctrl-left',
  'ctrl-right',
  'ctrl-shift-c',
  'ctrl-shift-v',
  'ctrl-v',
];

const readKeys = async (): Promise<Keys> => {
  const record: unknown = JSON.parse(await readFile('config/keys.json', 'utf8'));
  const isRecord = typeof record === 'object' && record !== null;

  if (!isRecord || !('global' in record) || !('terminal' in record)) {
    throw new TypeError('config/keys.json has no global or terminal section');
  }

  // SAFETY: config data whose key names the tests below compare as sets.
  return record as Keys;
};

const keysOutside = (section: Record<string, string>, allowed: string[]): string[] =>
  Object.keys(section)
    .filter((key) => !allowed.includes(key))
    .toSorted();

test('config/keys.json has no global key outside the allowlist', async () => {
  const global = (await readKeys()).global;
  const outside = keysOutside(global, allowedGlobalKeys);

  expect(outside, 'global keys outside the allowlist').toEqual([]);
  expect(Object.keys(global).toSorted()).toEqual(allowedGlobalKeys);
});

test('config/keys.json has no terminal key outside the allowlist', async () => {
  const terminal = (await readKeys()).terminal;
  const outside = keysOutside(terminal, allowedTerminalKeys);

  expect(outside, 'terminal keys outside the allowlist').toEqual([]);
  expect(Object.keys(terminal).toSorted()).toEqual(allowedTerminalKeys);
});
