import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { IconName, TextRole } from '../../../kit/index.ts';
import {
  actionButton,
  attentionBadge,
  colors,
  controlSize,
  icon,
  iconButton,
  indicator,
  programIcon,
  radius,
  roleText,
  spacing,
  statusMark,
  tab,
  textField,
  textRoles,
  toggleButton,
  withTextRole,
} from '../../../kit/index.ts';
import type { SceneInputs } from './inputs.ts';

interface FakePane {
  name: string;
  folder: string;
  focused: boolean;
  status: Status | null;
}

interface FakeTab {
  label: string;
  active: boolean;
  status: Status | null;
  hovered?: boolean;
}

const fakePanes: FakePane[] = [
  { name: 'Claude Code', folder: '~/code/koja', focused: true, status: 'working' },
  { name: 'zsh', folder: '~/code/tikk', focused: false, status: 'blocked' },
];

const fakeTabs: FakeTab[] = [
  { label: 'koja', active: true, status: 'working' },
  { label: 'nvim', active: false, status: 'done' },
  { label: 'logs', active: false, status: null, hovered: true },
];

const paneButtonNames: IconName[] = ['columns-2', 'rows-2', 'maximize-2', 'x'];

const roleOrder: TextRole[] = ['viewTitle', 'title', 'body', 'sectionHeading', 'detail', 'badge'];

const roleNames: Record<TextRole, string> = {
  viewTitle: 'View title',
  title: 'Title',
  body: 'Body',
  sectionHeading: 'Section heading',
  detail: 'Detail',
  badge: 'Badge',
};

const section = (name: string, content: Element[]): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xsmall)
    .child(roleText('sectionHeading', name))
    .children(content);

const line = (content: Element[]): Element =>
  h_flex().flex_none().gap(spacing.small).items_center().children(content);

const paneStatus = (status: Status | null): Element[] => {
  if (status === 'blocked') {
    return [attentionBadge('Needs you')];
  }

  return status === null ? [] : [statusMark(status)];
};

const paneHeader = (pane: FakePane): Element => {
  const palette = colors();
  const buttons = pane.focused ? paneButtonNames.map((name) => iconButton({ name })) : [];

  const header = h_flex()
    .h(controlSize.sectionHeader)
    .px(spacing.large)
    .gap(spacing.medium)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.selected)
    .child(programIcon(null, 'default').text_color(pane.focused ? palette.muted : palette.dim))
    .child(roleText('detail', pane.name, pane.focused ? 'foreground' : 'muted').flex_initial())
    .child(roleText('detail', pane.folder).flex_1())
    .children(paneStatus(pane.status))
    .children(buttons);

  return v_flex()
    .flex_none()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(pane.focused ? palette.accent : palette.selected)
    .bg(palette.background)
    .child(header)
    .child(div().h(spacing.xxlarge));
};

const tabElement = (fakeTab: FakeTab): Element => {
  const palette = colors();
  const iconColor = fakeTab.active ? palette.foreground : palette.dim;

  return tab({
    label: fakeTab.label,
    active: fakeTab.active,
    icon: programIcon(null, 'small').text_color(iconColor),
    status: fakeTab.status,
    close: iconButton({ name: 'x', size: 'small' }),
    hovered: fakeTab.hovered === true,
  });
};

const tabBar = (): Element =>
  h_flex()
    .h(controlSize.tabBar)
    .flex_none()
    .px(spacing.xsmall)
    .gap(spacing.xxsmall)
    .items_center()
    .rounded(radius.dialog)
    .bg(colors().chrome)
    .children(fakeTabs.map(tabElement))
    .child(h_flex().flex_1())
    .child(iconButton({ name: 'plus' }))
    .child(toggleButton({ label: 'Changes', active: true, start: icon('git-compare', 'small') }))
    .child(toggleButton({ label: 'Files', active: false, start: icon('folder', 'small') }))
    .child(h_flex().mx(spacing.small).child(indicator('ansi2')));

const buttons = (): Element[] => [
  line([
    roleText('detail', 'Default').flex_none(),
    iconButton({ name: 'plus' }),
    iconButton({ name: 'search', hovered: true }),
    iconButton({ name: 'x' }),
  ]),
  line([
    roleText('detail', 'Small').flex_none(),
    iconButton({ name: 'plus', size: 'small' }),
    iconButton({ name: 'chevron-down', size: 'small', hovered: true }),
    iconButton({ name: 'x', size: 'small' }),
  ]),
];

const toggles = (): Element[] => [
  line([
    toggleButton({ label: 'Active', active: true }),
    toggleButton({ label: 'Normal', active: false }),
    toggleButton({ label: 'Hovered', active: false, hovered: true }),
  ]),
  line([attentionBadge('Needs you'), statusMark('working'), statusMark('done')]),
];

const fields = (inputs: SceneInputs): Element[] => [
  textField(inputs.field, false),
  textField(inputs.filledField, true),
  line([
    actionButton({ label: 'Create', enabled: true }),
    actionButton({ label: 'Create', enabled: false }),
  ]),
];

const roleRow = (role: TextRole): Element => {
  const style = textRoles[role];
  const weight = style.weight === 'semibold' ? 'SemiBold' : 'Regular';

  return v_flex()
    .flex_none()
    .child(withTextRole(h_flex(), role).child(roleNames[role]))
    .child(roleText('detail', `${style.size} px · ${weight} · ${style.color}`));
};

const typeRoles = (): Element[] => roleOrder.map((role) => roleRow(role));

export const controlsScene = (inputs: SceneInputs): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .px(spacing.large)
    .pt(spacing.small)
    .pb(spacing.large)
    .gap(spacing.medium)
    .child(section('Pane header', fakePanes.map(paneHeader)))
    .child(section('Tabs', [tabBar()]))
    .child(
      h_flex()
        .flex_none()
        .gap(spacing.xxlarge)
        .items_start()
        .child(
          v_flex()
            .flex_1()
            .gap(spacing.medium)
            .child(section('Buttons', buttons()))
            .child(section('Toggles and marks', toggles()))
            .child(section('Fields and actions', fields(inputs))),
        )
        .child(v_flex().flex_1().child(section('Type roles', typeRoles()))),
    );
