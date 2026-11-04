import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import type { RowState } from '../../../kit/index.ts';
import { emptyState, listRow, sectionHeader, spaceMark, spacing } from '../../../kit/index.ts';

interface FakeSpace {
  label: string;
  status: Status | null;
  state: RowState;
}

const fakeSpaces: FakeSpace[] = [
  { label: 'koja', status: 'working', state: 'normal' },
  {
    label: 'feature/a-branch-name-long-enough-to-run-past-the-sidebar-edge',
    status: 'idle',
    state: 'selected',
  },
  { label: 'tikk', status: null, state: 'normal' },
];

const spaceRow = (space: FakeSpace): Element =>
  listRow({
    size: 'medium',
    inset: true,
    state: space.state,
    label: space.label,
    start: spaceMark(space.status),
  });

const section = (title: string, content: Element): Element =>
  v_flex()
    .gap(spacing.small)
    .child(sectionHeader({ label: title, size: 'default' }))
    .child(content);

export const sidebarScene = (): Element =>
  v_flex()
    .gap(spacing.xlarge)
    .py(spacing.medium)
    .child(section('Spaces', v_flex().children(fakeSpaces.map(spaceRow))))
    .child(section('Agents', emptyState('No agents running.')));
