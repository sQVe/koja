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
  textRoleNames,
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

const roleNames: Record<TextRole, string> = {
  viewTitle: 'View title',
  title: 'Title',
  body: 'Body',
  sectionHeading: 'Section heading',
  detail: 'Detail',
  badge: 'Badge',
  tag: 'Tag',
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
  const iconInk = pane.focused ? palette.muted : palette.dim;
  const nameInk = pane.focused ? 'foreground' : 'muted';
  const borderInk = pane.focused ? palette.accent : palette.selected;
  const paneIcon = programIcon(null, 'default').text_color(iconInk);
  const paneName = roleText('detail', pane.name, nameInk).flex_initial();
  const paneFolder = roleText('detail', pane.folder).flex_1();
  const bottomSpace = div().h(spacing.xxlarge);

  const header = h_flex()
    .h(controlSize.sectionHeader)
    .px(spacing.large)
    .gap(spacing.medium)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.selected)
    .child(paneIcon)
    .child(paneName)
    .child(paneFolder)
    .children(paneStatus(pane.status))
    .children(buttons);

  return v_flex()
    .flex_none()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(borderInk)
    .bg(palette.background)
    .child(header)
    .child(bottomSpace);
};

const tabElement = (fakeTab: FakeTab): Element => {
  return tab({
    label: fakeTab.label,
    active: fakeTab.active,
    icon: programIcon(null, 'small'),
    status: fakeTab.status,
    close: iconButton({ name: 'x', size: 'small' }),
    hovered: fakeTab.hovered === true,
  });
};

const tabBar = (): Element => {
  const spacer = h_flex().flex_1();

  const changesToggle = toggleButton({
    label: 'Changes',
    active: true,
    start: icon('git-compare', 'small'),
  });

  const filesToggle = toggleButton({
    label: 'Files',
    active: false,
    start: icon('folder', 'small'),
  });

  const indicatorSlot = h_flex().mx(spacing.small).child(indicator('ansi2'));

  return h_flex()
    .h(controlSize.tabBar)
    .flex_none()
    .px(spacing.xsmall)
    .gap(spacing.xxsmall)
    .items_center()
    .rounded(radius.dialog)
    .bg(colors().chrome)
    .children(fakeTabs.map(tabElement))
    .child(spacer)
    .child(iconButton({ name: 'plus' }))
    .child(changesToggle)
    .child(filesToggle)
    .child(indicatorSlot);
};

const buttons = (): Element[] => {
  const defaultTitle = roleText('detail', 'Default').flex_none();
  const smallTitle = roleText('detail', 'Small').flex_none();

  return [
    line([
      defaultTitle,
      iconButton({ name: 'plus' }),
      iconButton({ name: 'search', hovered: true }),
      iconButton({ name: 'x' }),
    ]),
    line([
      smallTitle,
      iconButton({ name: 'plus', size: 'small' }),
      iconButton({ name: 'chevron-down', size: 'small', hovered: true }),
      iconButton({ name: 'x', size: 'small' }),
    ]),
  ];
};

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

  const roleName = withTextRole(h_flex(), role).child(roleNames[role]);

  return v_flex()
    .flex_none()
    .child(roleName)
    .child(roleText('detail', `${style.size} px · ${weight} · ${style.color}`));
};

const typeRoles = (): Element[] => textRoleNames.map((role) => roleRow(role));

export const controlsScene = (inputs: SceneInputs): Element => {
  const controlSections = v_flex()
    .flex_1()
    .gap(spacing.medium)
    .child(section('Buttons', buttons()))
    .child(section('Toggles and marks', toggles()))
    .child(section('Fields and actions', fields(inputs)));

  const typeSection = v_flex().flex_1().child(section('Type roles', typeRoles()));

  const columns = h_flex()
    .flex_none()
    .gap(spacing.xxlarge)
    .items_start()
    .child(controlSections)
    .child(typeSection);

  return v_flex()
    .flex_1()
    .min_h(0)
    .px(spacing.large)
    .pt(spacing.small)
    .pb(spacing.large)
    .gap(spacing.medium)
    .child(section('Pane header', fakePanes.map(paneHeader)))
    .child(section('Tabs', [tabBar()]))
    .child(columns);
};
