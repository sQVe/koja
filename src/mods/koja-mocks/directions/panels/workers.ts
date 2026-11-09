import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon } from '../../../../kit/index.ts';
import { label, row, statusMark, styled } from '../parts.ts';
import { dimFact, listRowGap, questionMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';
import { managerName, workers } from './data.ts';
import { budgetSlot, stateColumn, workerState } from './workerColumns.ts';
import { replyField, replyPlaceholder, sendHint } from './workerReply.ts';

type AskStyle = 'plain' | 'waiting';

export type QuestionRoom = 'full' | 'compact';

interface ListLook {
  style: AskStyle;
  room: QuestionRoom;
}

const markWidth = 14;
const nestIndent = 12;
// The space list nests its workers by the kit's list indent (`indentWidth` in the kit's size.ts).
const kitIndent = 20;
const rowGap = 6;
const questionGap = 4;
const questionPadding = 4;
const profileWidth = 36;
const timeWidth = 62;
// The selected pill pads the question mark's 12 px icon by 8 px, as it pads the state word on the
// right: the 14 px mark slot centers the icon 1 px in.
const markBearing = 1;

export const workerCount = workers.length;

const indentOf = (style: AskStyle): number => (style === 'waiting' ? kitIndent : nestIndent);

const workerMark = (worker: FakeWorker, tokens: DirectionTokens): Element => {
  if (worker.status === 'blocked') {
    return questionMark(tokens);
  }

  return statusMark(worker.status, tokens).w(markWidth);
};

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

const managerEnd = (status: Status | null, tokens: DirectionTokens): Element[] => {
  if (status === null) {
    return [];
  }

  const word = status === 'working' ? 'running' : 'idle';

  return [stateColumn(word, tokens)];
};

const managerLine = (status: Status | null, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: managerStart(status, tokens),
      label: label(managerName, tokens.text.body, tokens.ink.muted),
      end: managerEnd(status, tokens),
    },
    tokens,
  );

const plainRow = (worker: FakeWorker, tokens: DirectionTokens): Element =>
  row(
    {
      selected: worker.selected,
      start: workerMark(worker, tokens),
      label: label(worker.task, tokens.text.body, tokens.ink.text),
      end: [
        dimFact(worker.profile, tokens).w(profileWidth),
        dimFact(worker.left, tokens).w(timeWidth),
      ],
    },
    tokens,
  ).pl(tokens.rows.paddingX + indentOf('plain'));

const stateRow = (worker: FakeWorker, tokens: DirectionTokens): Element =>
  row(
    {
      selected: worker.selected,
      start: workerMark(worker, tokens),
      label: label(worker.task, tokens.text.body, tokens.ink.text),
      end: [
        dimFact(worker.profile, tokens).w(profileWidth),
        budgetSlot(worker, tokens),
        stateColumn(workerState(worker), tokens),
      ],
    },
    tokens,
  )
    .ml(tokens.rows.inset + indentOf('waiting'))
    .pl(tokens.rows.paddingX - markBearing);

const workerRow = (worker: FakeWorker, style: AskStyle, tokens: DirectionTokens): Element =>
  style === 'waiting' ? stateRow(worker, tokens) : plainRow(worker, tokens);

const questionFrame = (style: AskStyle, tokens: DirectionTokens): Element => {
  const { rows } = tokens;
  const taskStart = rows.paddingX + indentOf(style) + markWidth + rowGap;

  return v_flex()
    .flex_none()
    .mx(rows.inset)
    .pl(taskStart)
    .pr(rows.paddingX)
    .py(questionPadding)
    .gap(questionGap);
};

const questionLine = (worker: FakeWorker, style: AskStyle, tokens: DirectionTokens): Element[] => {
  if (worker.question === undefined) {
    return [];
  }

  const text = label(worker.question.text, tokens.text.body, tokens.ink.muted);

  return [questionFrame(style, tokens).pt(0).child(text)];
};

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
  const age = waiting ? `asked ${asked}` : asked;
  const opened = questionFrame(look.style, tokens);
  const frame = waiting ? opened.pt(0) : opened;

  const block = frame
    .child(questionText(worker.question.text, look.room, tokens))
    .child(dimFact(age, tokens));

  if (reply) {
    const end = waiting ? [sendHint()] : [];

    block.child(replyField(replyPlaceholder(worker, waiting, tokens), end, tokens));
  }

  return [block];
};

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

// The space list spaces its rows as the sidebar does.
const listFrame = (style: AskStyle, tokens: DirectionTokens): Element => {
  const gap = style === 'waiting' ? listRowGap : tokens.rows.gap;

  return v_flex().flex_none().py(tokens.rows.listPadding).gap(gap);
};

export const workerListOf = (
  shown: FakeWorker[],
  reply: boolean,
  tokens: DirectionTokens,
): Element =>
  listFrame('plain', tokens)
    .child(managerLine(null, tokens))
    .children(workerRowsWith(shown, reply, { style: 'plain', room: 'full' }, tokens));

export const waitingWorkerList = (
  shown: FakeWorker[],
  manager: Status,
  room: QuestionRoom,
  tokens: DirectionTokens,
): Element =>
  listFrame('waiting', tokens)
    .child(managerLine(manager, tokens))
    .children(workerRowsWith(shown, true, { style: 'waiting', room }, tokens));

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

export const workerAlerts = (tokens: DirectionTokens): Element[] => {
  const asking = workers.some((worker) => worker.status === 'blocked');

  return asking ? [questionMark(tokens)] : [];
};
