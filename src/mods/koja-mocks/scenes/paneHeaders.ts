import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Program } from 'herdr';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import {
  colors,
  controlSize,
  paneHeader,
  paneHeaderMenu,
  radius,
  roleText,
  shellSize,
  spacing,
} from '../../../kit/index.ts';

const agentProgram: Program = {
  key: 'claude',
  name: 'Claude Code',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

const shellProgram: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const focusedAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Build window shell',
  branch: 'me-1089-window-shell',
  folder: '~/code/koja',
  status: 'working',
  focused: true,
  zoomed: false,
  width: shellSize.wideSpecimenWidth,
};

const hoveredAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Review judge findings',
  branch: 'me-1104-judge-findings',
  folder: '~/code/koja',
  status: 'working',
  focused: false,
  hovered: true,
  zoomed: false,
  width: shellSize.wideSpecimenWidth,
};

const longTask = 'Move pane headers onto the shared kit part';
const longBranch = 'me-1089-window-shell-layout-and-tab-bar';
const longFolder = '~/code/koja/packages/desktop/src/mods/koja-mocks';

const folderCutAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Build window shell',
  branch: 'me-1089-window-shell',
  folder: longFolder,
  status: 'working',
  focused: false,
  zoomed: false,
  width: shellSize.folderCutWidth,
};

const branchCutAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Build window shell',
  branch: longBranch,
  folder: longFolder,
  status: 'working',
  focused: false,
  zoomed: false,
  width: shellSize.branchCutWidth,
};

const taskCutAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: longTask,
  branch: longBranch,
  folder: longFolder,
  status: 'working',
  focused: false,
  zoomed: false,
  width: shellSize.taskCutWidth,
};

const needsYouAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Fix the close dialog',
  folder: '~/code/koja',
  status: 'blocked',
  focused: false,
  zoomed: false,
  width: shellSize.folderCutWidth,
};

const shellAgent: PaneHeaderOptions = {
  program: shellProgram,
  name: 'zsh',
  folder: '~/code/tikk',
  status: null,
  focused: false,
  zoomed: false,
  width: shellSize.folderCutWidth,
};

const compactAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Build window shell',
  branch: 'me-1089-window-shell',
  folder: '~/code/koja',
  status: 'working',
  focused: true,
  zoomed: false,
  width: shellSize.compactSpecimenWidth,
};

const specimen = (header: PaneHeaderOptions): Element => {
  const palette = colors();

  const card = v_flex()
    .flex_none()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(header.focused ? palette.accent : palette.selected)
    .bg(palette.background)
    .overflow_hidden()
    .child(paneHeader(header))
    .child(
      v_flex()
        .h(shellSize.specimenBodyHeight)
        .flex_none()
        .p(spacing.medium)
        .child(roleText('detail', 'Terminal text')),
    );

  return header.width == null ? card : card.w(header.width);
};

// The open menu hangs under the overflow button, at the right end of the compact header. Herdr
// draws a real popup's outline itself, so the scene draws it here.
const compactWithMenu = (header: PaneHeaderOptions): Element => {
  const menuWidth = header.width ?? shellSize.compactSpecimenWidth;
  const palette = colors();

  return v_flex()
    .relative()
    .w(menuWidth)
    .flex_none()
    .child(specimen(header))
    .child(
      v_flex()
        .absolute()
        .top(controlSize.sectionHeader)
        .right(spacing.none)
        .rounded(radius.dialog)
        .border(spacing.hairline)
        .border_color(palette.border)
        .child(
          paneHeaderMenu({
            task: header.task,
            branch: header.branch,
            folder: header.folder,
            zoomed: header.zoomed,
          }),
        ),
    );
};

export const paneHeadersScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(spacing.medium)
    .gap(spacing.medium)
    .child(specimen(focusedAgent))
    .child(specimen(hoveredAgent))
    .child(specimen(folderCutAgent))
    .child(specimen(branchCutAgent))
    .child(specimen(taskCutAgent))
    .child(specimen(needsYouAgent))
    .child(specimen(shellAgent))
    .child(compactWithMenu(compactAgent));
