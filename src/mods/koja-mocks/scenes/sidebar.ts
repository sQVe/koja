import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { RowState, ThemeToken } from '../../../kit/index.ts';
import {
  attentionBadge,
  colors,
  detailText,
  icon,
  iconButton,
  indicator,
  listRow,
  radius,
  repoLabel,
  sectionHeader,
  shortAge,
  spaceMark,
  spacing,
  stateLine,
  statusMark,
  toggleButton,
} from '../../../kit/index.ts';

interface FakePull {
  number: number;
  token: ThemeToken;
}

interface FakeSpace {
  label: string;
  status: Status | null;
  state: RowState;
  pull?: FakePull;
  badge?: string;
}

interface FakeRepo {
  name: string;
  detail: string;
  status: Status | null;
  error?: string;
  spaces: FakeSpace[];
}

// The fake clock the scene's ages count back from, in seconds.
const fakeNow = 1_800_000_000;

// When each repository's main branch last changed, in seconds.
const kojaCommittedAt = 1_799_992_200;

const tikkCommittedAt = 1_799_740_800;

const ageOf = (thenSeconds: number): string => shortAge(thenSeconds, fakeNow);

const fakeRepos: FakeRepo[] = [
  {
    name: 'koja',
    detail: `main · ${ageOf(kojaCommittedAt)}`,
    status: 'blocked',
    error: 'Could not read pull requests.',
    spaces: [
      {
        label: 'me-1088-ui-foundation',
        status: 'working',
        state: 'normal',
        pull: { number: 24, token: 'ansi2' },
      },
      {
        label: 'me-1104-judge-findings-only-and-a-name-long-enough-to-truncate',
        status: 'idle',
        state: 'selected',
      },
      {
        label: 'fix-pr-badge',
        status: 'blocked',
        state: 'normal',
        pull: { number: 27, token: 'dim' },
        badge: 'Needs you',
      },
      { label: 'scratch', status: null, state: 'normal' },
    ],
  },
  {
    name: 'tikk',
    detail: `main · ${ageOf(tikkCommittedAt)}`,
    status: 'done',
    spaces: [
      {
        label: 'ticket-sync',
        status: 'done',
        state: 'normal',
        pull: { number: 12, token: 'ansi5' },
      },
      {
        label: 'release-notes',
        status: null,
        state: 'normal',
        pull: { number: 15, token: 'ansi2' },
      },
    ],
  },
];

const spaceEnd = (space: FakeSpace): Element[] => {
  const end: Element[] = [];

  if (space.pull !== undefined) {
    end.push(detailText(`#${space.pull.number}`, colors()[space.pull.token]));
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
    start: spaceMark(space.status),
    end: spaceEnd(space),
  });

const repoRow = (repo: FakeRepo): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    label: repoLabel({ name: repo.name, detail: repo.detail, folded: false, selected: false }),
    end: [statusMark(repo.status)],
  });

const errorLine = (text: string): Element =>
  stateLine({ kind: 'error', text, action: toggleButton({ label: 'Retry', active: false }) });

const repoGroup = (repo: FakeRepo): Element => {
  const group = v_flex().child(repoRow(repo));

  if (repo.error !== undefined) {
    group.child(errorLine(repo.error));
  }

  return group.children(repo.spaces.map(spaceRow));
};

const machineHeader = (): Element =>
  sectionHeader({
    label: 'This computer',
    size: 'default',
    interactive: true,
    start: icon('monitor', 'small'),
    end: [
      iconButton({ name: 'plus', size: 'small' }),
      indicator('ansi2'),
      icon('chevron-down', 'small'),
    ],
  });

const remoteHeader = (): Element =>
  sectionHeader({
    label: 'build-box',
    size: 'default',
    interactive: true,
    start: icon('server', 'small'),
    end: [detailText('asleep'), indicator('dim'), icon('chevron-right', 'small')],
  });

export const sidebarScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .py(spacing.medium)
    .gap(spacing.medium)
    .rounded(radius.dialog)
    .bg(colors().chrome)
    .child(machineHeader())
    .children(fakeRepos.map(repoGroup))
    .child(div().flex_1())
    .child(remoteHeader());
