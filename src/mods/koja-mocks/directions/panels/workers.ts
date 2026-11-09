import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon } from '../../../../kit/index.ts';
import { label, row, statusMark, styled } from '../parts.ts';
import { dimFact, questionMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';
import { managerName, workers } from './data.ts';

// How a list shows asking workers. `plain` keeps every time left at the row end. `waiting` says
// `waiting` at an asking worker's row end, moves its time left to its question line, and
// right-aligns the row's status.
type AskStyle = 'plain' | 'waiting';

// How much room the selected question gets: `full` wraps its text, `compact` keeps one line.
export type QuestionRoom = 'full' | 'compact';

interface ListLook {
  style: AskStyle;
  room: QuestionRoom;
}

const markWidth = 14;
const nestIndent = 12;
const rowGap = 6;
const questionGap = 4;
const questionPadding = 4;
const fieldPadding = 8;
const profileWidth = 36;
const timeWidth = 62;

export const workerCount = workers.length;

const workerMark = (worker: FakeWorker, tokens: DirectionTokens): Element => {
  if (worker.status === 'blocked') {
    return questionMark(tokens);
  }

  return statusMark(worker.status, tokens).w(markWidth);
};

// A manager with a state shows it as its one mark, in the slot its workers use.
const managerStart = (status: Status | null, tokens: DirectionTokens): Element => {
  if (status !== null) {
    return statusMark(status, tokens).w(markWidth);
  }

  return h_flex()
    .w(markWidth)
    .flex_none()
    .justify_center()
    .child(icon('terminal', 'small').text_color(tokens.ink.muted));
};

const managerLine = (status: Status | null, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: managerStart(status, tokens),
      label: label(managerName, tokens.text.body, tokens.ink.muted),
      end: [],
    },
    tokens,
  );

const rowTime = (worker: FakeWorker, style: AskStyle): string => {
  const waiting = style === 'waiting' && worker.question !== undefined;

  return waiting ? 'waiting' : worker.left;
};

const rowStatus = (worker: FakeWorker, style: AskStyle, tokens: DirectionTokens): Element => {
  const status = dimFact(rowTime(worker, style), tokens).w(timeWidth);

  return style === 'waiting' ? status.text_right() : status;
};

const workerRow = (worker: FakeWorker, style: AskStyle, tokens: DirectionTokens): Element =>
  row(
    {
      selected: worker.selected,
      start: workerMark(worker, tokens),
      label: label(worker.task, tokens.text.body, tokens.ink.text),
      end: [dimFact(worker.profile, tokens).w(profileWidth), rowStatus(worker, style, tokens)],
    },
    tokens,
  ).pl(tokens.rows.paddingX + nestIndent);

const replyField = (placeholder: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.controls.size)
    .flex_none()
    .px(fieldPadding)
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(label(placeholder, tokens.text.body, tokens.ink.dim));

const questionFrame = (tokens: DirectionTokens): Element => {
  const { rows } = tokens;
  const taskStart = rows.paddingX + nestIndent + markWidth + rowGap;

  return v_flex()
    .flex_none()
    .mx(rows.inset)
    .pl(taskStart)
    .pr(rows.paddingX)
    .py(questionPadding)
    .gap(questionGap);
};

// A waiting worker's time left ends its question line; the question truncates first.
const questionLine = (worker: FakeWorker, style: AskStyle, tokens: DirectionTokens): Element[] => {
  if (worker.question === undefined) {
    return [];
  }

  const text = label(worker.question.text, tokens.text.body, tokens.ink.muted);

  if (style === 'plain') {
    return [questionFrame(tokens).pt(0).child(text)];
  }

  const line = h_flex()
    .min_w(0)
    .gap(questionGap)
    .items_center()
    .child(text)
    .child(h_flex().flex_1())
    .child(dimFact(worker.left, tokens));

  return [questionFrame(tokens).pt(0).child(line)];
};

// The full question wraps, so it is never cut.
const questionText = (text: string, room: QuestionRoom, tokens: DirectionTokens): Element =>
  room === 'compact'
    ? label(text, tokens.text.body, tokens.ink.text)
    : styled(div().min_w(0), tokens.text.body, tokens.ink.text).child(text);

// The waiting style opens the question as close under its row as a question line sits.
const fullQuestion = (
  worker: FakeWorker,
  reply: boolean,
  look: ListLook,
  tokens: DirectionTokens,
): Element[] => {
  if (worker.question === undefined) {
    return [];
  }

  const { asked } = worker.question;
  const waiting = look.style === 'waiting';
  const age = waiting ? `${asked} · ${worker.left}` : asked;
  const placeholder = waiting ? `Reply to ${worker.task}` : 'Reply to the worker';
  const frame = waiting ? questionFrame(tokens).pt(0) : questionFrame(tokens);

  const block = frame
    .child(questionText(worker.question.text, look.room, tokens))
    .child(dimFact(age, tokens));

  if (reply) {
    block.child(replyField(placeholder, tokens));
  }

  return [block];
};

// The selected worker's question opens under its task; another asking worker keeps one line.
const questionBlock = (
  worker: FakeWorker,
  reply: boolean,
  look: ListLook,
  tokens: DirectionTokens,
): Element[] =>
  worker.selected
    ? fullQuestion(worker, reply, look, tokens)
    : questionLine(worker, look.style, tokens);

const workerRowsWith = (
  shown: FakeWorker[],
  reply: boolean,
  look: ListLook,
  tokens: DirectionTokens,
): Element[] =>
  shown.flatMap((worker) => [
    workerRow(worker, look.style, tokens),
    ...questionBlock(worker, reply, look, tokens),
  ]);

const listFrame = (tokens: DirectionTokens): Element =>
  v_flex().flex_none().py(tokens.rows.listPadding).gap(tokens.rows.gap);

export const workerListOf = (
  shown: FakeWorker[],
  reply: boolean,
  tokens: DirectionTokens,
): Element =>
  listFrame(tokens)
    .child(managerLine(null, tokens))
    .children(workerRowsWith(shown, reply, { style: 'plain', room: 'full' }, tokens));

// An asking worker waits on the user, so its row says so and its time left joins the question.
export const waitingWorkerList = (
  shown: FakeWorker[],
  manager: Status,
  room: QuestionRoom,
  tokens: DirectionTokens,
): Element =>
  listFrame(tokens)
    .child(managerLine(manager, tokens))
    .children(workerRowsWith(shown, true, { style: 'waiting', room }, tokens));

// Rows with one-line questions only; the selected question shows in its own pinned detail.
export const workerRowsOf = (shown: FakeWorker[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .child(managerLine(null, tokens))
    .children(
      shown.flatMap((worker) => [
        workerRow(worker, 'plain', tokens),
        ...(worker.selected ? [] : questionLine(worker, 'plain', tokens)),
      ]),
    );

// The detail sits apart from its row, so it names the worker it answers.
export const questionDetail = (shown: FakeWorker[], tokens: DirectionTokens): Element[] => {
  const asking = shown.find((worker) => worker.selected && worker.question !== undefined);

  if (asking === undefined) {
    return [];
  }

  const title = row(
    {
      selected: false,
      start: workerMark(asking, tokens),
      label: label(asking.task, tokens.text.body, tokens.ink.text),
      end: [dimFact(asking.profile, tokens)],
    },
    tokens,
  );

  const question = fullQuestion(asking, true, { style: 'plain', room: 'full' }, tokens).map(
    (block) => block.pl(tokens.rows.paddingX + markWidth + rowGap),
  );

  return [v_flex().flex_none().py(tokens.rows.listPadding).child(title).children(question)];
};

export const askingCount = (shown: FakeWorker[]): number =>
  shown.filter((worker) => worker.question !== undefined).length;

export const workerList = (reply: boolean, tokens: DirectionTokens): Element =>
  workerListOf(workers, reply, tokens);

// A worker's question must stay visible while Workers is hidden.
export const workerAlerts = (tokens: DirectionTokens): Element[] => {
  const asking = workers.some((worker) => worker.status === 'blocked');

  return asking ? [questionMark(tokens)] : [];
};
