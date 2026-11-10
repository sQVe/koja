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
import type { WorkNeed } from '../sidebars/content.ts';
import { questionMark, workNeedMark } from '../sidebars/facts.ts';
import { retryPill } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { CheckState, ContentItem } from './data.ts';
import { externalLink } from './links.ts';

interface ContentSectionLook {
  name: string;
  count?: number;
  need?: WorkNeed;
}

export const readingInset = spacing.xxlarge;

const actionPadding = 12;
const chipHeight = 20;
const proseWidth = 720;
const viewTitle = { size: textSize.large, semibold: true };

export const paragraph = (text: string, tokens: DirectionTokens): Element =>
  styled(div().min_w(0).max_w(proseWidth), tokens.text.body, tokens.ink.text).child(text);

export const scrollBody = (name: string): Element =>
  v_flex().id(name).flex_1().min_h(0).min_w(0).overflow_y_scrollbar();

export const sendButton = (enabled: boolean, tokens: DirectionTokens): Element => {
  const ink = enabled ? tokens.pane.fill : tokens.ink.dim;

  const button = h_flex()
    .h(controlSize.dialogButton)
    .px(actionPadding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .disabled(!enabled)
    .child(fixedLabel('Send to Tau', tokens.text.body, ink));

  if (enabled) {
    button.bg(tokens.ink.text);
  }

  if (!enabled) {
    button.cursor_not_allowed().tooltip('Save your edits before sending');
  }

  return button;
};

const stateChip = (state: string, tokens: DirectionTokens): Element => {
  const active = state === 'open' || state === 'sent';
  const color = active ? tokens.marks.done : tokens.marks.idle;
  const mark = state === 'in review' ? questionMark(tokens) : dot(markSize.quietDot, color);

  return h_flex()
    .h(chipHeight)
    .px(spacing.small)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(tokens.marks.badgeRadius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(mark)
    .child(fixedLabel(state, tokens.text.detail, tokens.ink.muted));
};

export const contentHeader = (item: ContentItem, tokens: DirectionTokens): Element => {
  const header = paneHeaderFrame(tokens);
  const ink = tokens.pane.focusedHeaderInk ?? tokens.ink.text;

  if (tokens.pane.focusedHeaderFill !== null) {
    header.bg(tokens.pane.focusedHeaderFill);
  }

  return header
    .child(icon(item.icon, 'small').text_color(ink))
    .child(label(item.name, tokens.text.title, ink).flex_1())
    .child(iconButton('maximize-2', tokens, tokens.ink.dim))
    .child(iconButton('ellipsis', tokens, tokens.ink.dim));
};

export const itemHeading = (item: ContentItem, tokens: DirectionTokens): Element => {
  const heading = v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .pt(spacing.xlarge)
    .pb(spacing.medium)
    .gap(spacing.xxsmall)
    .child(externalLink(item.identifier, item.source, tokens));

  if (item.title !== null) {
    heading.child(
      h_flex()
        .min_h(controlSize.dialogButton)
        .min_w(0)
        .items_center()
        .child(styled(div().min_w(0).flex_1(), viewTitle, tokens.ink.text).child(item.title)),
    );
  }

  if (item.state !== null) {
    const state = h_flex()
      .mt(spacing.xsmall)
      .gap(spacing.medium)
      .items_center()
      .child(stateChip(item.state, tokens));

    if (item.unsaved === true) {
      state.child(fixedLabel('unsaved', tokens.text.detail, tokens.marks.working));
    }

    if (item.readAge !== null) {
      state.child(fixedLabel(`synced ${item.readAge}`, tokens.text.detail, tokens.ink.dim));
    }

    heading.child(state);
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

const copyPathButton = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(chipHeight)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(fixedLabel('Copy path', tokens.text.detail, tokens.ink.muted));

export const saveFailure = (tokens: DirectionTokens): Element =>
  v_flex()
    .gap(spacing.medium)
    .child(
      h_flex()
        .min_w(0)
        .gap(spacing.small)
        .items_start()
        .child(
          icon('circle-alert', 'small')
            .flex_none()
            .mt(spacing.xxsmall)
            .text_color(tokens.marks.blocked),
        )
        .child(
          styled(div().min_w(0).flex_1(), tokens.text.detail, tokens.ink.text).child(
            'Could not save: ~/code/koja/.tau/reviews is read-only',
          ),
        ),
    )
    .child(h_flex().gap(spacing.small).child(retryPill(tokens)).child(copyPathButton(tokens)))
    .child(
      paragraph(
        '1 line and 2 comments are unsaved. They stay in this pane, and Send waits for a save.',
        tokens,
      ),
    );

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

  const end: Element[] = [];

  if (look.count !== undefined) {
    title.child(fixedLabel(String(look.count), tokens.text.detail, tokens.ink.dim));
  }

  if (look.need !== undefined) {
    end.push(workNeedMark(look.need, tokens));
  }

  return sectionHeaderOf(title, { open, detail, end }, tokens);
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
    .px(readingInset)
    .py(spacing.xsmall)
    .gap(spacing.xsmall)
    .children(item.description.map((text) => paragraph(text, tokens)));
