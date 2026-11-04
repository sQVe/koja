import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import type { RowState } from '../../../../kit/index.ts';
import { listRow, sectionHeader, spaceMark, spacing, statusMark } from '../../../../kit/index.ts';

type SpacesQuality = 'clean' | 'nearPass' | 'nearFail' | 'clearFail';

interface FakeSpace {
  label: string;
  status: Status | null;
}

const fakeSpaces: FakeSpace[] = [
  { label: 'koja', status: 'working' },
  { label: 'payments-service', status: 'blocked' },
  { label: 'tikk', status: 'idle' },
  { label: 'notes', status: null },
];

const fakeAgents = fakeSpaces.filter((space): space is FakeSpace & { status: Status } => {
  return space.status !== null;
});

const selectedIndex = 1;

const rowState = (quality: SpacesQuality, index: number): RowState => {
  if (quality === 'nearFail') {
    return 'normal';
  }

  return index === selectedIndex ? 'selected' : 'normal';
};

const startMark = (quality: SpacesQuality, status: Status | null): Element => {
  const missingAgentMark = quality === 'nearPass' && status === null;
  const hidesMark = quality === 'clearFail' || missingAgentMark;

  return hidesMark ? statusMark(null) : spaceMark(status);
};

const spaceRow = (space: FakeSpace, quality: SpacesQuality, index: number): Element =>
  listRow({
    size: 'medium',
    inset: true,
    state: rowState(quality, index),
    start: startMark(quality, space.status),
    label: space.label,
  });

const agentRow = (agent: FakeSpace & { status: Status }): Element =>
  listRow({
    size: 'medium',
    inset: true,
    state: 'normal',
    start: statusMark(agent.status),
    label: agent.label,
  });

const section = (title: string, content: Element): Element =>
  v_flex()
    .gap(spacing.small)
    .child(sectionHeader({ label: title, size: 'default' }))
    .child(content);

const spacesScene = (quality: SpacesQuality): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .gap(spacing.xlarge)
    .py(spacing.medium)
    .child(
      section(
        'Spaces',
        v_flex().children(fakeSpaces.map((space, index) => spaceRow(space, quality, index))),
      ),
    )
    .child(section('Agents', v_flex().children(fakeAgents.map(agentRow))));

export const spacesClean = (): Element => spacesScene('clean');

export const spacesNearPass = (): Element => spacesScene('nearPass');

export const spacesNearFail = (): Element => spacesScene('nearFail');

export const spacesClearFail = (): Element => spacesScene('clearFail');
