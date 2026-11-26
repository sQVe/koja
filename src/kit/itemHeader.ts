import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from './icon.ts';
import { badgeSize, spacing } from './size.ts';
import type { SourceLinkOptions } from './sourceLink.ts';
import { sourceLink } from './sourceLink.ts';
import { questionBubble, statusMark } from './statusMark.ts';
import { detailText } from './text.ts';
import { roleText, withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

type ItemStateKind = 'openPullRequest' | 'inProgress' | 'inReview' | 'sent';

export interface ItemStateOptions {
  kind: ItemStateKind;
  // The state word comes from the item's source, such as `open` or `In progress`.
  label: string;
  // The duration since the item was read, drawn as `synced 1m ago`.
  age: string | null;
}

export type ItemHeaderOptions = SourceLinkOptions &
  (
    | { kind: 'loading' }
    | {
        kind: 'ready';
        title: string;
        state: ItemStateOptions | null;
      }
  );

const stateMarks: Record<ItemStateKind, () => Element> = {
  openPullRequest: () => icon('git-pull-request', 'small').text_color(colors().done),
  inReview: questionBubble,
  inProgress: () => statusMark('working'),
  sent: () => statusMark('done'),
};

const stateMark = (kind: ItemStateKind): Element => stateMarks[kind]();

const stateChip = (state: ItemStateOptions): Element => {
  const chip = h_flex()
    .h(badgeSize.height)
    .px(badgeSize.padding)
    .gap(spacing.xsmall)
    .min_w(0)
    .items_center()
    .rounded(badgeSize.radius)
    .border(badgeSize.border)
    .border_color(colors().border);

  const stateLabel = roleText('detail', state.label, 'muted').tooltip(state.label);

  return chip.child(stateMark(state.kind)).child(stateLabel);
};

const stateRow = (state: ItemStateOptions): Element => {
  const row = h_flex()
    .mt(spacing.xsmall)
    .gap(spacing.medium)
    .items_center()
    .child(stateChip(state));

  if (state.age !== null) {
    row.child(detailText(`synced ${state.age}`));
  }

  return row;
};

const titleText = (title: string): Element => {
  const box = div().min_w(0);

  return withTextRole(box, 'viewTitle').child(title);
};

export const itemHeader = (options: ItemHeaderOptions): Element => {
  const header = v_flex()
    .flex_none()
    .min_w(0)
    .px(spacing.xxlarge)
    .pt(spacing.xlarge)
    .pb(spacing.medium)
    .gap(spacing.xxsmall)
    .child(sourceLink(options));

  if (options.kind === 'loading') {
    return header;
  }

  header.child(titleText(options.title));

  if (options.state !== null) {
    header.child(stateRow(options.state));
  }

  return header;
};
