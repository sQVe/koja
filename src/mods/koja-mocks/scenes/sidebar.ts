import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import type { RowState } from '../../../kit/index.ts';
import {
  attentionBadge,
  colors,
  detailText,
  listRow,
  radius,
  projectHeader,
  shortAge,
  spaceMark,
  spacing,
  stateLine,
  toggleButton,
} from '../../../kit/index.ts';

interface FakeSpace {
  label: string;
  status: Status | null;
  state: RowState;
  pull?: number;
  badge?: string;
}

interface FakeRepo {
  name: string;
  error?: string;
  spaces: FakeSpace[];
}

const fakeNow = 1_800_000_000;

const kojaPullsReadAt = 1_799_999_640;

const ageOf = (thenSeconds: number): string => shortAge(thenSeconds, fakeNow);

const fakeRepos: FakeRepo[] = [
  {
    name: 'koja',
    error: `koja PRs are ${ageOf(kojaPullsReadAt)} old.`,
    spaces: [
      {
        label: 'me-1088-ui-foundation',
        status: 'working',
        state: 'normal',
        pull: 24,
      },
      {
        label: 'me-1104-judge-findings',
        status: 'idle',
        state: 'normal',
      },
      {
        label: 'fix-pr-badge',
        status: 'blocked',
        state: 'normal',
        pull: 27,
        badge: 'Needs you',
      },
      { label: 'scratch', status: null, state: 'normal' },
    ],
  },
  {
    name: 'tikk',
    spaces: [
      {
        label: 'ticket-sync',
        status: 'done',
        state: 'normal',
        pull: 12,
      },
      {
        label: 'release-notes',
        status: null,
        state: 'normal',
        pull: 15,
      },
    ],
  },
];

const spaceEnd = (space: FakeSpace): Element[] => {
  const end: Element[] = [];

  if (space.pull !== undefined) {
    end.push(detailText(`#${space.pull}`));
  }

  if (space.badge !== undefined) {
    end.push(attentionBadge(space.badge));
  }

  return end;
};

const spaceRow = (space: FakeSpace): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: space.state,
    label: space.label,
    cut: 'middle',
    start: spaceMark(space.status),
    end: spaceEnd(space),
  });

const repoHeader = (repo: FakeRepo): Element =>
  projectHeader({
    kind: 'fold',
    name: repo.name,
    folded: false,
    hidden: 0,
    onToggle: () => undefined,
  });

const errorLine = (text: string): Element =>
  stateLine({ kind: 'error', text, action: toggleButton({ label: 'Retry', active: false }) });

const repoGroup = (repo: FakeRepo): Element => {
  const group = v_flex().child(repoHeader(repo));

  if (repo.error !== undefined) {
    group.child(errorLine(repo.error));
  }

  return group.children(repo.spaces.map(spaceRow));
};

export const sidebarScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .py(spacing.medium)
    .gap(spacing.medium)
    .rounded(radius.dialog)
    .bg(colors().chrome)
    .children(fakeRepos.map(repoGroup));
