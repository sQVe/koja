import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import {
  icon,
  iconButton,
  iconToggle,
  modePill,
  spacing,
  statusMark,
  toggleButton,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

export const buttons = (): Element[] => {
  const sizes = h_flex()
    .gap(spacing.medium)
    .items_center()
    .child(iconButton({ name: 'plus' }))
    .child(iconButton({ name: 'plus', size: 'small' }));

  const iconButtons = h_flex()
    .gap(spacing.medium)
    .items_center()
    .child(iconButton({ name: 'plus' }))
    .child(iconButton({ name: 'plus', hovered: true }))
    .child(iconButton({ name: 'x', size: 'small' }))
    .child(iconButton({ name: 'x', size: 'small', hovered: true }));

  const toggleButtons = h_flex()
    .gap(spacing.xxsmall)
    .child(toggleButton({ label: 'Active', active: true, start: icon('file', 'small') }))
    .child(toggleButton({ label: 'Normal', active: false, start: statusMark('blocked'), end: '2' }))
    .child(toggleButton({ label: 'Hovered', active: false, hovered: true }))
    .child(toggleButton({ label: 'Quiet', active: false, quiet: true }));

  const iconToggles = h_flex()
    .gap(spacing.medium)
    .items_center()
    .child(iconToggle({ name: 'git-compare', label: 'Changes', active: true }))
    .child(iconToggle({ name: 'folder', label: 'Files', active: false }))
    .child(iconToggle({ name: 'git-compare', label: 'Changes', active: false, hovered: true }));

  const modePills = h_flex()
    .gap(spacing.medium)
    .items_center()
    .child(modePill({ label: 'Normal' }));

  return [
    sample('Small 16 px button beside the 22 px button', sizes),
    sample('Icon buttons: normal, hovered, small, small hovered', iconButtons),
    sample('Icon toggles: active, inactive, inactive hovered', iconToggles),
    sample('Toggle buttons: active, normal, hovered, quiet', toggleButtons),
    sample('Mode pill', modePills),
  ];
};
