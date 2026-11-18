import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, markSize, spacing, textSize } from '../../../../kit/size.ts';
import { sectionHeaderOf } from '../panels/frame.ts';
import {
  dot,
  fixedLabel,
  iconButton,
  label,
  paneHeaderFrame,
  statusMark,
  styled,
} from '../parts.ts';
import { questionMark, workNeedMark } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { CheckState, ContentItem } from './data.ts';
import { externalLink } from './links.ts';

interface ContentSectionLook {
  name: string;
  count?: number;
}

interface SaveFailureDetails {
  error: string;
  folder: string;
  unsaved: string;
}

export const readingInset = spacing.xxlarge;

const sectionMarkWidth = 12;
const sectionMarkGap = 6;

export const sectionBodyInset = (tokens: DirectionTokens): number =>
  tokens.rows.inset + tokens.rows.paddingX + sectionMarkWidth + sectionMarkGap;

const actionPadding = 12;
const chipHeight = 20;
const proseWidth = 720;
const viewTitle = { size: textSize.large, semibold: true };

export const paragraph = (text: string, tokens: DirectionTokens): Element => {
  const container = div().min_w(0).max_w(proseWidth);

  return styled(container, tokens.text.body, tokens.ink.text).child(text);
};

export const scrollBody = (name: string): Element =>
  v_flex().id(name).flex_1().min_h(0).min_w(0).overflow_y_scrollbar();

export const reviewActionButton = (text: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(controlSize.dialogButton)
    .px(actionPadding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .bg(tokens.ink.text)
    .child(fixedLabel(text, tokens.text.body, tokens.pane.fill));

const itemState = (state: string, look: 'badge' | 'plain', tokens: DirectionTokens): Element => {
  const active = state === 'open' || state === 'sent';
  const color = active ? tokens.marks.done : tokens.marks.idle;
  let mark = dot(markSize.quietDot, color);

  if (state === 'in review') {
    mark = questionMark(tokens);
  }

  if (state === 'In progress') {
    mark = statusMark('working', tokens);
  }

  const element = h_flex().h(chipHeight).gap(spacing.xsmall).flex_none().items_center();

  if (look === 'badge') {
    element
      .px(spacing.small)
      .rounded(tokens.marks.badgeRadius)
      .border(1)
      .border_color(tokens.pane.border);
  }

  const ink = look === 'plain' ? color : tokens.ink.muted;

  return element.child(mark).child(fixedLabel(state, tokens.text.detail, ink));
};

export const contentHeader = (item: ContentItem, tokens: DirectionTokens): Element => {
  const header = paneHeaderFrame(tokens);
  const ink = tokens.pane.focusedHeaderInk ?? tokens.ink.text;

  if (tokens.pane.focusedHeaderFill !== null) {
    header.bg(tokens.pane.focusedHeaderFill);
  }

  const itemIcon = icon(item.icon, 'small').text_color(ink);
  const name = label(item.name, tokens.text.title, ink).flex_1();

  return header
    .child(itemIcon)
    .child(name)
    .child(iconButton('maximize-2', tokens, tokens.ink.dim))
    .child(iconButton('ellipsis', tokens, tokens.ink.dim));
};

export const itemHeading = (
  item: ContentItem,
  actions: Element[],
  stateLook: 'badge' | 'plain',
  tokens: DirectionTokens,
): Element => {
  const heading = v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .pt(spacing.xlarge)
    .pb(spacing.medium)
    .gap(spacing.xxsmall)
    .child(externalLink(item.identifier, item.source, tokens));

  if (item.title !== null) {
    const container = div().min_w(0).flex_1();
    const title = styled(container, viewTitle, tokens.ink.text).child(item.title);

    const titleRow = h_flex().min_h(controlSize.dialogButton).min_w(0).items_center().child(title);

    heading.child(titleRow);
  }

  if (item.state !== null) {
    const state = h_flex()
      .mt(spacing.xsmall)
      .gap(spacing.medium)
      .items_center()
      .child(itemState(item.state, stateLook, tokens));

    if (item.unsaved === true) {
      state.child(fixedLabel('unsaved', tokens.text.detail, tokens.marks.working));
    }

    if (item.readAge !== null) {
      state.child(fixedLabel(`synced ${item.readAge}`, tokens.text.detail, tokens.ink.dim));
    }

    heading.child(state.children(actions));
  }

  return heading;
};

export const checkMark = (state: CheckState, tokens: DirectionTokens): Element => {
  if (state === 'failing') {
    return workNeedMark('failing', tokens);
  }

  const status = state === 'running' ? 'working' : 'done';

  return statusMark(status, tokens);
};

export const saveRecoveryButton = (text: string, tokens: DirectionTokens): Element =>
  h_flex()
    .h(chipHeight)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(fixedLabel(text, tokens.text.detail, tokens.ink.muted));

export const saveFailure = (tokens: DirectionTokens, details: SaveFailureDetails): Element => {
  const alertIcon = icon('circle-alert', 'small')
    .flex_none()
    .mt(spacing.xxsmall)
    .text_color(tokens.marks.blocked);

  const errorContainer = div().min_w(0);

  const errorText = styled(errorContainer, tokens.text.detail, tokens.ink.text).child(
    details.error,
  );

  const folder = label(details.folder, tokens.text.detail, tokens.ink.text)
    .text_ellipsis_start()
    .tooltip(details.folder);

  const messages = v_flex().min_w(0).flex_1().gap(spacing.xsmall).child(errorText).child(folder);

  const failureRow = h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_start()
    .child(alertIcon)
    .child(messages);

  const copyButton = saveRecoveryButton('Copy path', tokens);
  const recovery = h_flex().child(copyButton);
  const waitContainer = div().min_w(0);

  const waitNote = styled(waitContainer, tokens.text.detail, tokens.ink.dim).child(
    'Send to Tau waits for a save.',
  );

  return v_flex()
    .gap(spacing.medium)
    .child(failureRow)
    .child(recovery)
    .child(paragraph(details.unsaved, tokens))
    .child(waitNote);
};

export const contentSectionHeader = (
  look: ContentSectionLook,
  open: boolean,
  detail: Element[],
  tokens: DirectionTokens,
): Element => {
  const title = h_flex()
    .gap(spacing.small)
    .items_center()
    .child(fixedLabel(look.name, tokens.text.heading, tokens.ink.text));

  if (look.count !== undefined) {
    title.child(fixedLabel(String(look.count), tokens.text.detail, tokens.ink.dim));
  }

  return sectionHeaderOf(title, { open, detail, end: [] }, tokens);
};

export const contentSection = (
  look: ContentSectionLook,
  parts: Element[],
  tokens: DirectionTokens,
): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(contentSectionHeader(look, true, [], tokens))
    .children(parts);

export const description = (item: ContentItem, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .pl(sectionBodyInset(tokens))
    .pr(readingInset)
    .py(spacing.xsmall)
    .gap(spacing.xsmall)
    .children(item.description.map((text) => paragraph(text, tokens)));
