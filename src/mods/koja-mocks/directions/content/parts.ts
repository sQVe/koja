import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { controlSize, markSize, spacing, textSize } from '../../../../kit/size.ts';
import { sectionHeader } from '../panels/frame.ts';
import { dot, fixedLabel, iconButton, label, paneHeaderFrame, styled } from '../parts.ts';
import type { WorkNeed } from '../sidebars/content.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ContentItem } from './data.ts';

export const readingInset = spacing.xxlarge;

const actionPadding = 12;
const chipHeight = 20;
const proseWidth = 720;
const viewTitle = { size: textSize.large, semibold: true };

export const paragraph = (text: string, tokens: DirectionTokens): Element =>
  styled(div().min_w(0).max_w(proseWidth), tokens.text.body, tokens.ink.text).child(text);

export const scrollBody = (name: string): Element =>
  v_flex().id(name).flex_1().min_h(0).min_w(0).overflow_y_scrollbar();

export const doneButton = (enabled: boolean, tokens: DirectionTokens): Element => {
  const fill = enabled ? tokens.ink.text : tokens.rows.selectedFill;
  const ink = enabled ? tokens.pane.fill : tokens.ink.dim;

  const button = h_flex()
    .h(controlSize.dialogButton)
    .px(actionPadding)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .bg(fill)
    .disabled(!enabled)
    .child(fixedLabel('Done', tokens.text.body, ink));

  if (!enabled) {
    button.cursor_not_allowed().tooltip('Save your edits before sending');
  }

  return button;
};

const stateChip = (state: string, tokens: DirectionTokens): Element => {
  const active = state === 'open' || state === 'sent';
  const color = active ? tokens.marks.done : tokens.marks.idle;

  return h_flex()
    .h(chipHeight)
    .px(spacing.small)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(tokens.marks.badgeRadius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(dot(markSize.quietDot, color))
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
    .child(sourceLink(item.identifier, tokens).text_color(tokens.ink.dim));

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
    heading.child(h_flex().mt(spacing.xsmall).child(stateChip(item.state, tokens)));
  }

  return heading;
};

export const contentSection = (
  name: string,
  parts: Element[],
  tokens: DirectionTokens,
  need?: WorkNeed,
): Element => {
  const end: Element[] = [];

  if (need !== undefined) {
    end.push(workNeedMark(need, tokens));
  }

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(sectionHeader({ name, open: true, detail: [], end }, tokens))
    .children(parts);
};

export const description = (item: ContentItem, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .py(spacing.large)
    .gap(spacing.large)
    .children(item.description.map((text) => paragraph(text, tokens)));
