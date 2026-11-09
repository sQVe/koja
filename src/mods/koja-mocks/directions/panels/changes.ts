import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';

import type { FileStatus } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';
import { changeRows } from '../../scenes/shellContent.ts';
import { fixedLabel, label, middleCutLabel, row, styled } from '../parts.ts';
import { togglePillInk } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { branchChanges } from './data.ts';

interface SwitchLook {
  uncommitted: number;
  branch: number;
  branchActive: boolean;
}

const markSlotWidth = 12;
const switchGap = 2;
const barPadding = 8;
const barGap = 6;
const fieldPadding = 8;
const buttonPadding = 10;

export const fileStatusInk = (status: FileStatus, tokens: DirectionTokens): Color => {
  const { marks } = tokens;

  if (status === 'M') {
    return marks.modified;
  }

  return status === 'D' ? marks.removed : marks.added;
};

export const diffCounts = (add: number, del: number, tokens: DirectionTokens): Element[] => {
  const { marks, text } = tokens;
  const counts: Element[] = [];

  if (add > 0) {
    counts.push(fixedLabel(`+${add}`, text.detail, marks.added));
  }

  if (del > 0) {
    counts.push(fixedLabel(`−${del}`, text.detail, marks.removed));
  }

  return counts;
};

const changeRow = (change: FakeChange, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: fixedLabel(change.status, tokens.text.title, fileStatusInk(change.status, tokens)).w(
        markSlotWidth,
      ),
      label: middleCutLabel(change.path, tokens.text.body, tokens.ink.text),
      end: diffCounts(change.add, change.del, tokens),
    },
    tokens,
  );

export const changeListOf = (changes: FakeChange[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .children(changes.map((change) => changeRow(change, tokens)));

export const changeList = (tokens: DirectionTokens): Element => changeListOf(changeRows, tokens);

// Folded rows of a long list; the chevron opens them in place, as a folder opens in a tree.
export const moreRow = (hidden: number, noun: string, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: h_flex()
        .w(markSlotWidth)
        .flex_none()
        .justify_center()
        .child(icon('chevron-right', 'xsmall').text_color(tokens.ink.dim)),
      label: label(`${hidden} more ${noun}`, tokens.text.body, tokens.ink.dim),
      end: [],
    },
    tokens,
  );

export const changeTotals = (tokens: DirectionTokens): Element[] => {
  const add = changeRows.reduce((sum, change) => sum + change.add, 0);
  const del = changeRows.reduce((sum, change) => sum + change.del, 0);

  return diffCounts(add, del, tokens);
};

export const uncommittedCount = changeRows.length;

const switchPill = (
  name: string,
  count: number,
  active: boolean,
  tokens: DirectionTokens,
): Element => {
  const { ink } = tokens;
  const idle = count === 0 ? ink.dim : ink.muted;

  return togglePillInk(`${name} ${count}`, active, active ? ink.text : idle, tokens);
};

export const changeSwitchOf = (look: SwitchLook, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .mt(tokens.rows.listPadding)
    .mx(tokens.rows.inset)
    .gap(switchGap)
    .items_center()
    .child(switchPill('Uncommitted', look.uncommitted, !look.branchActive, tokens))
    .child(switchPill('Branch', look.branch, look.branchActive, tokens));

export const changeSwitch = (tokens: DirectionTokens): Element =>
  changeSwitchOf(
    { uncommitted: uncommittedCount, branch: branchChanges.length, branchActive: false },
    tokens,
  );

const commitField = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .h(tokens.controls.size)
    .px(fieldPadding)
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(label('Commit message', tokens.text.body, tokens.ink.dim));

const commitButton = (tokens: DirectionTokens): Element =>
  styled(
    h_flex()
      .h(tokens.controls.size)
      .px(buttonPadding)
      .flex_none()
      .items_center()
      .rounded(tokens.controls.radius)
      .bg(tokens.controls.toggleFill),
    tokens.text.body,
    tokens.ink.text,
  ).child('Commit');

export const commitBar = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .p(barPadding)
    .gap(barGap)
    .items_center()
    .border_t(1)
    .border_color(tokens.pane.headerDivider)
    .child(commitField(tokens))
    .child(commitButton(tokens));
