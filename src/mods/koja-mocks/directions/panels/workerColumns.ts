import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { dimFact } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';

// Sized to the widest value in Geist 11 px (`22m budget`, `working`), so every row keeps the same
// gap between its role, budget, and state columns.
const budgetWidth = 62;
const stateWidth = 41;

const stateWords: Record<Status, string> = {
  working: 'running',
  blocked: 'waiting',
  done: 'done',
  idle: 'idle',
};

// The fake data names the time left, such as `22m left`; a worker that is done has no budget.
const budgetPattern = /^(?<time>\S+) left$/v;

export const workerState = (worker: FakeWorker): string => stateWords[worker.status];

// The state word sits flush right, so the selected pill pads it as much as the mark on the left.
export const stateColumn = (word: string, tokens: DirectionTokens): Element =>
  h_flex().w(stateWidth).flex_none().justify_end().child(dimFact(word, tokens));

export const budgetSlot = (worker: FakeWorker, tokens: DirectionTokens): Element => {
  const time = budgetPattern.exec(worker.left)?.groups?.time;
  const slot = h_flex().w(budgetWidth).flex_none();

  return time === undefined ? slot : slot.child(dimFact(`${time} budget`, tokens));
};
