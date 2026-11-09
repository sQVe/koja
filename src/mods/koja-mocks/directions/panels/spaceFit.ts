import { listRowGap } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';
import { shownFileCount, shownFiles } from './rail.ts';
import type { RailState } from './railData.ts';
import type { QuestionRoom } from './workers.ts';

interface SpaceFit {
  fileRows: number;
  dropsDone: boolean;
  questionRoom: QuestionRoom;
}

interface WorkersLook {
  dropsDone: boolean;
  questionRoom: QuestionRoom;
}

// The mock cannot measure layout, so it counts what fits from the scene's sizes: the panel card
// is 688 px tall inside its border, and the question blocks were measured in a capture of the
// Geist 13 px text, the selected one with two lines, its age line, and the reply field. The open
// question sits 4 px closer to its row than in that capture, and a compact one drops a line. Rows
// in the worker list sit `listRowGap` apart, as in the sidebar; file rows hang in the rail, so they
// keep its gapless 24 px rhythm.
const panelInnerHeight = 688;
const questionLineHeight = 25;
const fullQuestionHeight = 96;
const compactQuestionHeight = 78;
const factsHeight = 24;
const dividerHeight = 1;
const fewestFileRows = 2;

const sectionTop = (tokens: DirectionTokens): number => {
  const { rows } = tokens;

  return rows.listPadding + rows.height + listRowGap + rows.listPadding;
};

// Everything in the Stack section except the checked-out PR's file rows, which the switch
// titles.
const stackHeight = (state: RailState, tokens: DirectionTokens): number => {
  const { rows } = tokens;
  const changesTitle = rows.height;

  if (state.onMain) {
    return sectionTop(tokens) + rows.height + changesTitle;
  }

  const pulls = state.pulls.filter((pull) => pull.state !== 'merged').length;
  const head = state.branch === undefined ? 0 : 1;
  const lines = (pulls + head + 1) * rows.height;

  return sectionTop(tokens) + lines + factsHeight + changesTitle;
};

const isDone = (worker: FakeWorker): boolean => worker.status === 'done';

const workerHeight = (worker: FakeWorker, room: QuestionRoom, tokens: DirectionTokens): number => {
  if (worker.question === undefined) {
    return tokens.rows.height;
  }

  const open = room === 'full' ? fullQuestionHeight : compactQuestionHeight;
  const question = worker.selected ? open : questionLineHeight;

  return tokens.rows.height + listRowGap + question;
};

const workersHeight = (state: RailState, look: WorkersLook, tokens: DirectionTokens): number => {
  if (state.workers.length === 0) {
    return 0;
  }

  const shown = look.dropsDone ? state.workers.filter((worker) => !isDone(worker)) : state.workers;

  const rows = shown.reduce(
    (sum, worker) => sum + workerHeight(worker, look.questionRoom, tokens),
    0,
  );

  const gaps = shown.length * listRowGap;

  return dividerHeight + sectionTop(tokens) + tokens.rows.height + gaps + rows;
};

const errorHeight = (state: RailState, tokens: DirectionTokens): number =>
  state.readFailed === undefined ? 0 : tokens.rows.height + tokens.rows.listPadding;

const fixedHeight = (state: RailState, tokens: DirectionTokens): number =>
  tokens.pane.headerHeight + errorHeight(state, tokens) + stackHeight(state, tokens);

const filesHeight = (shown: number, total: number, tokens: DirectionTokens): number => {
  const moreRow = shown < total ? 1 : 0;

  return (shown + moreRow) * tokens.rows.height;
};

const fileRowsThatFit = (state: RailState, look: WorkersLook, tokens: DirectionTokens): number => {
  const total = shownFileCount(state);
  const listed = shownFiles(state).length;
  const room = panelInnerHeight - fixedHeight(state, tokens) - workersHeight(state, look, tokens);

  if (filesHeight(listed, total, tokens) <= room) {
    return listed;
  }

  const rows = Math.floor(room / tokens.rows.height) - 1;

  return Math.min(listed, Math.max(fewestFileRows, rows));
};

const overflows = (state: RailState, look: WorkersLook, tokens: DirectionTokens): boolean => {
  const fileRows = fileRowsThatFit(state, look, tokens);
  const files = filesHeight(fileRows, shownFileCount(state), tokens);
  const used = fixedHeight(state, tokens) + files + workersHeight(state, look, tokens);

  return used > panelInnerHeight;
};

const workersLook = (state: RailState, tokens: DirectionTokens): WorkersLook => {
  const whole: WorkersLook = { dropsDone: false, questionRoom: 'full' };

  if (!overflows(state, whole, tokens)) {
    return whole;
  }

  const withoutDone: WorkersLook = { dropsDone: state.workers.some(isDone), questionRoom: 'full' };

  if (!overflows(state, withoutDone, tokens)) {
    return withoutDone;
  }

  return { ...withoutDone, questionRoom: 'compact' };
};

export const spaceFit = (state: RailState, tokens: DirectionTokens): SpaceFit => {
  const look = workersLook(state, tokens);

  return { fileRows: fileRowsThatFit(state, look, tokens), ...look };
};
