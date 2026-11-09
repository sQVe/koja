import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon } from '../../../../kit/index.ts';
import type { WorkNeed } from '../sidebars/content.ts';
import { dimFact, joinedFacts, workNeedMark } from '../sidebars/facts.ts';
import { mergedProgress } from '../sidebars/sidebar.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import { changeListOf, changeSegmentsOf, moreRow } from './changes.ts';
import type { FakePull } from './data.ts';
import { fileTree } from './data.ts';
import { fileFacts, fileListOf } from './files.ts';
import { panelCard, panelWidth, sectionDivider, sectionHeader } from './frame.ts';
import type { StateCard } from './rail.ts';
import { mainLine, shownFileCount, shownFiles, stateScene } from './rail.ts';
import type { RailState } from './railData.ts';
import { hangIndent, railListOf } from './railGraph.ts';
import { spaceFit, treeRowsThatFit } from './spaceFit.ts';
import { namedHeader, section, workersSectionHeader } from './splitParts.ts';
import { waitingWorkerList } from './workers.ts';

export type SpaceView = 'stack' | 'files';

const doneGap = 2;
// Moves the rail's center under the section header's chevron.
const railShift = 8;
const workersYield = 0.001;
// The most urgent need first.
const needOrder: WorkNeed[] = ['conflict', 'failing', 'review', 'restack', 'merge'];

// The Uncommitted and Branch switch titles the changes, on main as on a branch.
const changesTitle = (state: RailState, tokens: DirectionTokens): Element => {
  const { changes } = state;

  const look = {
    uncommitted: changes.uncommittedTotal,
    branch: changes.branchTotal,
    branchActive: changes.branchView,
  };

  return changeSegmentsOf(look, tokens);
};

// Every PR row stays in view; the checked-out PR's file list shows whole rows and folds the rest.
const pullFiles = (state: RailState, tokens: DirectionTokens): Element[] => {
  const { fileRows } = spaceFit(state, tokens);
  const total = shownFileCount(state);

  const list = changeListOf(shownFiles(state).slice(0, fileRows), tokens).py(0);

  if (fileRows < total) {
    list.child(moreRow(total - fileRows, 'files', tokens));
  }

  return [changesTitle(state, tokens), list];
};

const stackBody = (state: RailState, tokens: DirectionTokens): Element => {
  if (!state.onMain) {
    return railListOf(state, pullFiles, true, tokens).pl(railShift);
  }

  // The changes nest under main as deep as under a checked-out PR.
  const changes = v_flex()
    .flex_none()
    .pl(railShift + hangIndent)
    .children(pullFiles(state, tokens));

  return v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .child(mainLine([dimFact('no pull request', tokens)], tokens))
    .child(changes);
};

const needRank = (pull: FakePull): number => needOrder.indexOf(pull.need ?? 'merge');

const needingPulls = (state: RailState): FakePull[] =>
  state.pulls
    .filter((pull) => pull.need !== undefined)
    .toSorted((first, second) => needRank(first) - needRank(second));

// Names the PR of every need, worst first, since the worst need need not be the checked-out PR's.
const stackNeeds = (state: RailState, tokens: DirectionTokens): Element[] => {
  const [worst, ...others] = needingPulls(state);

  if (worst?.need === undefined) {
    return [];
  }

  const names = [
    dimFact(`#${worst.pull} ${worst.need}`, tokens),
    ...others.map((pull) => dimFact(`#${pull.pull}`, tokens)),
  ];

  return [joinedFacts(names, tokens), workNeedMark(worst.need, tokens)];
};

const stackProgress = (state: RailState, tokens: DirectionTokens): Element[] =>
  state.space.stack === undefined ? [] : [mergedProgress(state.space, tokens)];

// The banner says how old the stack shown under it is.
const staleStack = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.readFailed === undefined) {
    return [];
  }

  const text = `Could not read PRs · showing ${state.readFailed}`;

  return [errorLine(text, tokens).mt(tokens.rows.listPadding)];
};

const stackHeader = (state: RailState, tokens: DirectionTokens): Element =>
  sectionHeader(
    {
      name: 'Stack',
      open: true,
      detail: stackProgress(state, tokens),
      end: stackNeeds(state, tokens),
    },
    tokens,
  );

const stackSection = (state: RailState, tokens: DirectionTokens): Element =>
  section([stackHeader(state, tokens), stackBody(state, tokens)], tokens).flex_none();

// The tree ends on a whole row and folds the rest, like every list in the panel.
const filesSection = (state: RailState, tokens: DirectionTokens): Element => {
  const header = sectionHeader({ name: 'Files', open: true, detail: [], end: [] }, tokens);
  const shown = treeRowsThatFit(state, tokens);
  const list = fileListOf(fileTree.slice(0, shown), tokens);

  if (shown < fileTree.length) {
    list.child(moreRow(fileTree.length - shown, 'entries', tokens));
  }

  return section([header, list], tokens).flex_none();
};

// The manager works while any of its workers runs or waits.
const managerStatus = (state: RailState): Status => {
  const busy = state.workers.some((worker) => worker.status !== 'done');

  return busy ? 'working' : 'idle';
};

// Done workers that leave a short panel are still counted in the header, and the count opens a
// list of them.
const leftOut = (count: number, tokens: DirectionTokens): Element[] => {
  if (count === 0) {
    return [];
  }

  const control = h_flex()
    .flex_none()
    .gap(doneGap)
    .items_center()
    .rounded(tokens.rows.radius)
    .hover((hovered) => hovered.bg(tokens.rows.hoverFill))
    .child(dimFact(`${count} done`, tokens))
    .child(icon('chevron-down', 'xsmall').text_color(tokens.ink.dim));

  return [control];
};

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
        ...staleStack(state, tokens),
        view === 'files' ? filesSection(state, tokens) : stackSection(state, tokens),
        ...workersSection(view, state, tokens),
      ],
      panelWidth,
      tokens,
    );

export const spaceScene = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element =>
  stateScene(state, spaceCard(view), tokens);
