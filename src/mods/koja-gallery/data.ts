import type { Element } from 'gpui-kit';

import type { DataState } from '../../data/consumer.ts';
import { listRow, roleText, shortAge, stateLine } from '../../kit/index.ts';

type HeldState = Exclude<DataState, { kind: 'unavailable' }>;

const secondMilliseconds = 1000;

const minuteMilliseconds = 60_000;

const heartbeatAge = (heartbeatAt: number, now: number): string => {
  const elapsed = Math.max(0, now - heartbeatAt);

  if (elapsed < minuteMilliseconds) {
    return `${Math.floor(elapsed / secondMilliseconds)}s ago`;
  }

  return `${shortAge(heartbeatAt / secondMilliseconds, now / secondMilliseconds)} ago`;
};

const field = (label: string, value: string): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    label,
    end: [roleText('detail', value).flex_none()],
  });

const stateWord: Record<HeldState['kind'], string> = { live: 'Live', stale: 'Stale' };

export const dataLayer = (state: DataState, now: number): Element[] => {
  if (state.kind === 'unavailable') {
    return [stateLine({ kind: 'empty', text: 'Unavailable' })];
  }

  return [
    field('State', stateWord[state.kind]),
    field('Owner', state.owner),
    field('Generation', String(state.generation)),
    field('Revision', String(state.snapshot.revision)),
    field('Heartbeat', heartbeatAge(state.heartbeatAt, now)),
  ];
};
