import type { NormalAction, NormalKey } from '../../kit/normalKeys.ts';
import { normalKeys } from '../../kit/normalKeys.ts';

export interface ParserState {
  pending: string[];
  count: number | null;
}

export type ParseResult =
  | { status: 'pending'; state: ParserState }
  | { status: 'action'; action: NormalAction; state: ParserState }
  | { status: 'cleared'; state: ParserState };

export const initialParserState: ParserState = { pending: [], count: null };

const maxCount = 999;

const countBase = 10;

const sameKeys = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((key, index) => key === right[index]);

const startsWith = (keys: string[], tokens: string[]): boolean =>
  tokens.every((token, index) => keys[index] === token);

const isDigit = (key: string): boolean => key.length === 1 && key >= '0' && key <= '9';

const isCountStart = (key: string): boolean => key.length === 1 && key >= '1' && key <= '9';

const isCountKey = (state: ParserState, key: string): boolean => {
  if (state.pending.length > 0) {
    return false;
  }

  if (state.count === null) {
    return isCountStart(key);
  }

  return isDigit(key);
};

const countPending = (state: ParserState, key: string): ParseResult => {
  const digit = Number(key);
  const count = state.count === null ? digit : Math.min(state.count * countBase + digit, maxCount);

  return { status: 'pending', state: { pending: [], count } };
};

const actionFor = (entry: NormalKey, count: number | null): NormalAction => {
  if (count !== null && entry.counted === 'nthTab') {
    return { kind: 'nthTab', index: count };
  }

  return entry.action;
};

export const parseKey = (state: ParserState, key: string): ParseResult => {
  if (isCountKey(state, key)) {
    return countPending(state, key);
  }

  const tokens = [...state.pending, key];
  const exact = normalKeys.find((entry) => sameKeys(entry.keys, tokens));

  if (exact !== undefined) {
    return { status: 'action', action: actionFor(exact, state.count), state: initialParserState };
  }

  const isPrefix = normalKeys.some((entry) => startsWith(entry.keys, tokens));

  if (isPrefix) {
    return { status: 'pending', state: { pending: tokens, count: state.count } };
  }

  return { status: 'cleared', state: initialParserState };
};
