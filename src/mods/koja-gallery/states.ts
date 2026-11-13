import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { listRow, roleText, shortAge, spacing, stateLine, toggleButton } from '../../kit/index.ts';
import { sample } from './sample.ts';

type StateKind = 'empty' | 'loading' | 'error';

const stateKinds: StateKind[] = ['empty', 'loading', 'error'];

const stateText: Record<StateKind, string> = {
  empty: 'No uncommitted changes',
  loading: 'Loading changes…',
  error: 'Could not read git status.',
};

const retry = (): Element => toggleButton({ label: 'Retry', active: false });

const kindLines = (kind: StateKind): Element =>
  h_flex()
    .gap(spacing.large)
    .child(
      v_flex()
        .flex_1()
        .child(stateLine({ kind, text: stateText[kind] })),
    )
    .child(
      v_flex()
        .flex_1()
        .child(stateLine({ kind, text: stateText[kind], action: retry() })),
    );

const staleNow = 1_800_000_000;

const staleAgeSeconds = 240;

const staleFiles = ['src/kit/size.ts', 'src/kit/stateLine.ts', 'src/mods/koja-gallery/states.ts'];

const staleRow = (path: string): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    label: path,
    end: [roleText('detail', 'M').flex_none()],
  });

const staleRows = (): Element =>
  v_flex()
    .child(
      stateLine({
        kind: 'error',
        text: `Could not refresh koja. Showing changes from ${shortAge(staleNow - staleAgeSeconds, staleNow)} ago.`,
        action: retry(),
      }),
    )
    .children(staleFiles.map(staleRow));

const wrappedError = [
  "fatal: 'feat/search-results' is already checked out at '/work/koja/feat-search-results', so Grove cannot add another worktree for it until that worktree is removed or switched to another branch.",
  'hint: remove that worktree first, or pick another branch name.',
].join('\n');

export const states = (): Element[] => [
  sample(
    'Empty, loading, and error states, each with and without an action',
    v_flex().gap(spacing.xxsmall).children(stateKinds.map(kindLines)),
  ),
  sample('Stale rows: the error line names its resource and its age', staleRows()),
  sample(
    'A wrapping error line shows its whole message',
    stateLine({ kind: 'error', text: wrappedError, wrap: true }),
  ),
];
