import { shortAge } from '../../kit/age.ts';
import type { ChangesSnapshot, ReadOutcome } from './git.ts';

export interface ListLine {
  kind: 'empty' | 'loading' | 'error';
  text: string;
}

export interface ReadState {
  lastGood: { snapshot: ChangesSnapshot; readAt: number } | null;
  failure: string | null;
  watchFailed: boolean;
}

export const emptyReadState = (): ReadState => ({
  lastGood: null,
  failure: null,
  watchFailed: false,
});

const repositoryName = (root: string): string => root.slice(root.lastIndexOf('/') + 1);

export const isStale = (state: ReadState): boolean =>
  state.lastGood === null || state.failure !== null;

export const applyRead = (state: ReadState, outcome: ReadOutcome, now: number): ReadState => {
  if ('snapshot' in outcome) {
    return { ...state, lastGood: { snapshot: outcome.snapshot, readAt: now }, failure: null };
  }

  return { ...state, failure: outcome.failure };
};

const sinceText = (thenSeconds: number, nowSeconds: number): string => {
  const age = shortAge(thenSeconds, nowSeconds);

  return age === 'now' ? 'just now' : `${age} ago`;
};

const staleText = (lastGood: { snapshot: ChangesSnapshot; readAt: number }, now: number): string =>
  `Showing changes from ${sinceText(lastGood.readAt, now)}. Could not refresh ${repositoryName(lastGood.snapshot.root)}.`;

export const readStateLine = (state: ReadState, loading: boolean, now: number): ListLine | null => {
  if (state.failure !== null) {
    const text = state.lastGood === null ? state.failure : staleText(state.lastGood, now);

    return { kind: 'error', text };
  }

  if (loading) {
    return { kind: 'loading', text: 'Loading changes…' };
  }

  if (state.lastGood !== null && state.lastGood.snapshot.files.length > 0) {
    return null;
  }

  const text = state.lastGood === null ? 'No folder' : 'No uncommitted changes';

  return { kind: 'empty', text };
};

export const watchStateLine = (state: ReadState): ListLine | null => {
  const lastGood = state.lastGood;

  if (!state.watchFailed || lastGood === null) {
    return null;
  }

  return {
    kind: 'error',
    text: `Could not watch ${repositoryName(lastGood.snapshot.root)} for changes.`,
  };
};
