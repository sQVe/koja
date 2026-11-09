import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon, spacing } from '../../../../kit/index.ts';
import type { WorkNeed } from '../sidebars/content.ts';
import { dimFact, listRowGap, workNeedMark } from '../sidebars/facts.ts';
import { mergedProgress } from '../sidebars/sidebar.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { SwitchOption } from './changes.ts';
import { changeListOf, changeSegmentsOf, moreRow } from './changes.ts';
import { fileFacts } from './files.ts';
import {
  panelCard,
  panelHeader,
  panelTitle,
  panelWidth,
  sectionDivider,
  sectionHeader,
} from './frame.ts';
import type { StateCard } from './rail.ts';
import { mainLine, shownFileCount, shownFiles, stateScene } from './rail.ts';
import type { RailState } from './railData.ts';
import { railListOf } from './railGraph.ts';
import { spaceFit } from './spaceFit.ts';
import { section, workersSectionHeader } from './splitParts.ts';
import { waitingWorkerList } from './workers.ts';

const doneGap = spacing.xxsmall;
// Moves the rail's center under the section header's chevron.
const railShift = 8;
const workersYield = 0.001;
const needMarkGap = spacing.xsmall;
// The `main` row's branch mark and the gap after it, so its changes start under its text.
const branchMarkWidth = 14;
const branchGap = 6;

const needTooltips: Record<WorkNeed, string> = {
  conflict: 'merge conflict',
  failing: 'CI failing',
  review: 'review threads',
  restack: 'needs a restack',
  merge: 'ready to merge',
};

// Main has no base to compare against, so one option is left and it is no switch: a plain label
// whose text starts on the file marks' edge.
const uncommittedLabel = (count: number, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .items_center()
    .child(dimFact(`Uncommitted ${count}`, tokens));

// The switch titles the changes of a branch with a base.
const changesTitle = (state: RailState, tokens: DirectionTokens): Element => {
  const { changes } = state;

  if (!changes.hasBase) {
    return uncommittedLabel(changes.uncommittedTotal, tokens);
  }

  const options: SwitchOption[] = [
    { name: 'Uncommitted', count: changes.uncommittedTotal, active: !changes.branchView },
    { name: 'Branch', count: changes.branchTotal, active: changes.branchView },
  ];

  return changeSegmentsOf(options, tokens);
};

// Every PR row stays in view; the checked-out PR's file list shows whole rows and folds the rest.
const pullFiles = (state: RailState, tokens: DirectionTokens): Element[] => {
  const { fileRows } = spaceFit(state, tokens);
  const total = shownFileCount(state);

  const list = changeListOf(shownFiles(state).slice(0, fileRows), tokens).py(0).gap(0);

  if (fileRows < total) {
    list.child(moreRow(total - fileRows, 'files', tokens));
  }

  return [changesTitle(state, tokens), list];
};

// Under a section header the first row sits as close as the sidebar's rows sit under a group
// header.
const stackBody = (state: RailState, tokens: DirectionTokens): Element => {
  if (!state.onMain) {
    return railListOf(state, pullFiles, true, tokens).pl(railShift).pt(listRowGap);
  }

  // The label and the file marks start under the `main` text, one edge for the whole block.
  const changes = v_flex()
    .flex_none()
    .pl(branchMarkWidth + branchGap)
    .children(pullFiles(state, tokens));

  return v_flex()
    .flex_none()
    .pt(listRowGap)
    .pb(tokens.rows.listPadding)
    .child(mainLine([dimFact('no pull request', tokens)], tokens))
    .child(changes);
};

// One mark per PR that needs the user, in stack order. The rows below name the needs, so the
// header only marks them; each mark names its PR and need on hover.
const stackNeeds = (state: RailState, tokens: DirectionTokens): Element[] => {
  const marks = state.pulls.flatMap((pull) => {
    if (pull.need === undefined) {
      return [];
    }

    const tooltip = `#${pull.pull} · ${needTooltips[pull.need]}`;

    return [workNeedMark(pull.need, tokens).tooltip(tooltip)];
  });

  if (marks.length === 0) {
    return [];
  }

  return [h_flex().flex_none().gap(needMarkGap).items_center().children(marks)];
};

const stackProgress = (state: RailState, tokens: DirectionTokens): Element[] =>
  state.space.stack === undefined ? [] : [mergedProgress(state.space, tokens)];

// The banner says how old the stack shown under it is.
const staleStack = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.readFailed === undefined) {
    return [];
  }

  const text = `Could not read PRs · stack from ${state.readFailed}`;

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
const workersSection = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  const fit = spaceFit(state, tokens);
  const { dropsDone } = fit;
  const done = state.workers.filter((worker) => worker.status === 'done');
  const running = state.workers.filter((worker) => worker.status !== 'done');
  const shown = dropsDone ? running : state.workers;
  const hidden = dropsDone ? done.length : 0;
  const manager = managerStatus(state);

  const list = waitingWorkerList(shown, manager, fit.questionRoom, tokens).pt(listRowGap);

  return [
    sectionDivider(tokens),
    section([workersSectionHeader(state, leftOut(hidden, tokens), tokens), list], tokens)
      .flex_shrink(workersYield)
      .overflow_hidden(),
  ];
};

// The header is the terminal pane header's frame and title, with no view toggle.
const spaceHeader = (tokens: DirectionTokens): Element =>
  panelHeader([panelTitle('Space', tokens), ...fileFacts(tokens)], [], tokens);

const spaceCard: StateCard = (state, tokens) =>
  panelCard(
    [
      spaceHeader(tokens),
      ...staleStack(state, tokens),
      stackSection(state, tokens),
      ...workersSection(state, tokens),
    ],
    panelWidth,
    tokens,
  );

export const spaceScene = (state: RailState, tokens: DirectionTokens): Element =>
  stateScene(state, spaceCard, tokens);
