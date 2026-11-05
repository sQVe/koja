import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Program } from 'herdr';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import { colors, paneHeader, radius, roleText, shellSize, spacing } from '../../../kit/index.ts';

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

const unfocusedShell: PaneHeaderOptions = {
  program: shellProgram,
  name: 'zsh',
  folder: '~/code/tikk',
  status: null,
  focused: false,
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

const workingAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Codex',
  task: 'Wire the tab bar',
  branch: 'me-1122-foundation-parts',
  folder: '~/code/koja',
  status: 'working',
  focused: false,
  zoomed: true,
  width: shellSize.wideSpecimenWidth,
};

const needsYouAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Fix the close dialog',
  folder: '~/code/koja',
  status: 'blocked',
  focused: false,
  zoomed: false,
  width: shellSize.wideSpecimenWidth,
};

// The three narrow widths show the order: every field, the folder gone, then the branch gone and
// the task cut.
const fullAgent: PaneHeaderOptions = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Header',
  branch: 'me-1089-window-shell-layout-and-tab-bar',
  folder: '~/code/koja/packages/desktop/src/mods/koja-mocks',
  status: 'working',
  focused: true,
  zoomed: false,
  width: shellSize.fullSpecimenWidth,
};

const folderGoneAgent: PaneHeaderOptions = {
  ...fullAgent,
  task: 'Build window shell',
  width: shellSize.folderGoneWidth,
};

const branchGoneAgent: PaneHeaderOptions = {
  ...fullAgent,
  task: 'Move pane headers onto the shared kit part',
  width: shellSize.branchGoneWidth,
};

const compactAgent: PaneHeaderOptions = {
  ...branchGoneAgent,
  width: shellSize.compactSpecimenWidth,
  hovered: true,
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

export const paneHeadersScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(spacing.medium)
    .gap(spacing.medium)
    .child(specimen(focusedAgent))
    .child(specimen(unfocusedShell))
    .child(specimen(hoveredAgent))
    .child(specimen(workingAgent))
    .child(specimen(needsYouAgent))
    .child(specimen(fullAgent))
    .child(specimen(folderGoneAgent))
    .child(specimen(branchGoneAgent))
    .child(specimen(compactAgent));
