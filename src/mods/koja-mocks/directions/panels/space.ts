import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { fixedLabel } from '../parts.ts';
import type { WorkNeed } from '../sidebars/content.ts';
import { dimFact, workNeedMark } from '../sidebars/facts.ts';
import { mergedProgress } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { changeListOf, moreRow } from './changes.ts';
import type { FakePull } from './data.ts';
import { fileFacts, fileList } from './files.ts';
import { panelCard, panelWidth, sectionDivider, sectionHeader, sectionHeaderOf } from './frame.ts';
import type { StateCard } from './rail.ts';
import {
  changeScope,
  mainLine,
  readFailure,
  shownFileCount,
  shownFiles,
  stateScene,
} from './rail.ts';
import type { RailState } from './railData.ts';
import { railListOf } from './railGraph.ts';
import { spaceFit } from './spaceFit.ts';
import { namedHeader, section, workersSectionHeader } from './splitParts.ts';
import { waitingWorkerList } from './workers.ts';

export type SpaceView = 'stack' | 'files';

const shownTreeRows = 6;
// Moves the rail's center under the section header's chevron.
const railShift = 8;
// The tree gives up height long before Workers does.
const treeYield = 1;
const workersYield = 0.001;
// The most urgent need first.
const needOrder: WorkNeed[] = ['conflict', 'failing', 'review', 'restack', 'merge'];

// The Uncommitted and Branch switch titles the changes. Without a base there is no switch, so a
// nested header, lighter than the section headers, titles them and carries the count.
const changesTitle = (state: RailState, tokens: DirectionTokens): Element[] => {
  const scope = changeScope(state, tokens);

  if (scope.length > 0) {
    return scope;
  }

  const count = dimFact(String(shownFileCount(state)), tokens);

  return [
    sectionHeaderOf(
      fixedLabel('Changes', tokens.text.body, tokens.ink.muted),
      { open: true, detail: [count], end: [] },
      tokens,
    ),
  ];
};

// Every PR row stays in view; the checked-out PR's file list shows whole rows and folds the rest.
// A guide along the block's left edge ends it before the next PR row.
const pullFiles = (state: RailState, tokens: DirectionTokens): Element[] => {
  const { fileRows } = spaceFit(state, tokens);
  const total = shownFileCount(state);

  const list = changeListOf(shownFiles(state).slice(0, fileRows), tokens).py(0);

  if (fileRows < total) {
    list.child(moreRow(total - fileRows, 'files', tokens));
  }

  const block = v_flex()
    .flex_none()
    .border_l(1)
    .border_color(tokens.pane.border)
    .children(changesTitle(state, tokens))
    .child(list);

  return [block];
};

const stackBody = (state: RailState, tokens: DirectionTokens): Element => {
  if (!state.onMain) {
    return railListOf(state, pullFiles, true, tokens).pl(railShift);
  }

  return v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .child(mainLine(tokens))
    .children(pullFiles(state, tokens));
};

const topNeedPull = (state: RailState): FakePull | undefined => {
  const needing = state.pulls.filter((pull) => pull.need !== undefined);
  const rank = (pull: FakePull): number => needOrder.indexOf(pull.need ?? 'merge');

  return needing.toSorted((first, second) => rank(first) - rank(second))[0];
};

// Names the PR that owns the need, which need not be the checked-out one.
const topNeed = (state: RailState, tokens: DirectionTokens): Element[] => {
  const pull = topNeedPull(state);

  if (pull?.need === undefined) {
    return [];
  }

  return [dimFact(`#${pull.pull} ${pull.need}`, tokens), workNeedMark(pull.need, tokens)];
};

const stackProgress = (state: RailState, tokens: DirectionTokens): Element[] =>
  state.space.stack === undefined ? [] : [mergedProgress(state.space, tokens)];

const stackHeader = (state: RailState, tokens: DirectionTokens): Element =>
  sectionHeader(
    {
      name: 'Stack',
      open: true,
      detail: stackProgress(state, tokens),
      end: topNeed(state, tokens),
    },
    tokens,
  );

const stackSection = (state: RailState, tokens: DirectionTokens): Element =>
  section([stackHeader(state, tokens), stackBody(state, tokens)], tokens).flex_none();

// The section header plus six rows, so the tree never shrinks to nothing.
const treeFloor = (tokens: DirectionTokens): number => {
  const { rows } = tokens;

  return rows.listPadding * 2 + rows.height * (shownTreeRows + 1);
};

// The tree scrolls under its fixed header once Workers needs the room.
const filesSection = (tokens: DirectionTokens): Element => {
  const header = sectionHeader(
    { name: 'Files', open: true, detail: fileFacts(tokens), end: [] },
    tokens,
  );

  const region = v_flex().min_h(0).flex_shrink_1().overflow_hidden().child(fileList(tokens));

  return section([header, region], tokens)
    .flex_shrink(treeYield)
    .min_h(treeFloor(tokens))
    .overflow_hidden();
};

// The manager works while any of its workers runs or waits.
const managerStatus = (state: RailState): Status => {
  const busy = state.workers.some((worker) => worker.status !== 'done');

  return busy ? 'working' : 'idle';
};

// Done workers that leave a short panel are still counted in the header.
const leftOut = (count: number, tokens: DirectionTokens): Element[] =>
  count === 0 ? [] : [dimFact(`· ${count} done`, tokens)];

// The section hides when the space has no workers. When the panel runs out of height, done
// workers leave the list, then the open question keeps one line; running and waiting workers
// always stay.
const workersSection = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  const fit = view === 'stack' ? spaceFit(state, tokens) : undefined;
  const dropsDone = fit?.dropsDone === true;
  const done = state.workers.filter((worker) => worker.status === 'done');
  const running = state.workers.filter((worker) => worker.status !== 'done');
  const shown = dropsDone ? running : state.workers;
  const hidden = dropsDone ? done.length : 0;
  const list = waitingWorkerList(shown, managerStatus(state), fit?.questionRoom ?? 'full', tokens);

  return [
    sectionDivider(tokens),
    section([workersSectionHeader(state, leftOut(hidden, tokens), tokens), list], tokens)
      .flex_shrink(workersYield)
      .overflow_hidden(),
  ];
};

const spaceCard =
  (view: SpaceView): StateCard =>
  (state, tokens) =>
    panelCard(
      [
        namedHeader('Space', fileFacts(tokens), view === 'files', tokens),
        ...readFailure(state, tokens),
        view === 'files' ? filesSection(tokens) : stackSection(state, tokens),
        ...workersSection(view, state, tokens),
      ],
      panelWidth,
      tokens,
    );

export const spaceScene = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element =>
  stateScene(state, spaceCard(view), tokens);
