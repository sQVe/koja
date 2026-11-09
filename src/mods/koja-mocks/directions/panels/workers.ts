import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { label, row, statusMark, styled } from '../parts.ts';
import { dimFact, questionMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeWorker } from './data.ts';
import { managerName, workers } from './data.ts';

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

const managerLine = (tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: h_flex()
        .w(markWidth)
        .flex_none()
        .justify_center()
        .child(icon('terminal', 'small').text_color(tokens.ink.muted)),
      label: label(managerName, tokens.text.body, tokens.ink.muted),
      end: [],
    },
    tokens,
  );

const workerRow = (worker: FakeWorker, tokens: DirectionTokens): Element =>
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
  ).pl(tokens.rows.paddingX + nestIndent);

const replyField = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.controls.size)
    .flex_none()
    .px(fieldPadding)
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(label('Reply to the worker', tokens.text.body, tokens.ink.dim));

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

const questionLine = (worker: FakeWorker, tokens: DirectionTokens): Element[] => {
  if (worker.question === undefined) {
    return [];
  }

  return [
    questionFrame(tokens)
      .pt(0)
      .child(label(worker.question.text, tokens.text.body, tokens.ink.muted)),
  ];
};

// The full question wraps, so it is never cut.
const fullQuestion = (worker: FakeWorker, reply: boolean, tokens: DirectionTokens): Element[] => {
  if (worker.question === undefined) {
    return [];
  }

  const block = questionFrame(tokens)
    .child(styled(div().min_w(0), tokens.text.body, tokens.ink.text).child(worker.question.text))
    .child(dimFact(worker.question.asked, tokens));

  if (reply) {
    block.child(replyField(tokens));
  }

  return [block];
};

// The selected worker's question opens under its task; another asking worker keeps one line.
const questionBlock = (worker: FakeWorker, reply: boolean, tokens: DirectionTokens): Element[] =>
  worker.selected ? fullQuestion(worker, reply, tokens) : questionLine(worker, tokens);

export const workerListOf = (
  shown: FakeWorker[],
  reply: boolean,
  tokens: DirectionTokens,
): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .child(managerLine(tokens))
    .children(
      shown.flatMap((worker) => [
        workerRow(worker, tokens),
        ...questionBlock(worker, reply, tokens),
      ]),
    );

// Rows with one-line questions only; the selected question shows in its own pinned detail.
export const workerRowsOf = (shown: FakeWorker[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .child(managerLine(tokens))
    .children(
      shown.flatMap((worker) => [
        workerRow(worker, tokens),
        ...(worker.selected ? [] : questionLine(worker, tokens)),
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

  const question = fullQuestion(asking, true, tokens).map((block) =>
    block.pl(tokens.rows.paddingX + markWidth + rowGap),
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
