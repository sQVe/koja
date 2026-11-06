import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import {
  attentionBadge,
  colors,
  controlSize,
  diffSize,
  fileStatusMark,
  iconButton,
  iconToggle,
  listRow,
  modePill,
  paneHeader,
  programIcon,
  radius,
  repoLabel,
  roleText,
  shellSize,
  spaceMark,
  spacing,
  statusMark,
  tab,
} from '../../../kit/index.ts';
import type { FakeChange, FakeRepo, FakeSpace, FakeTab } from './shellContent.ts';
import { agentPane, changeRows, fakeRepos, fakeTabs, shellPane } from './shellContent.ts';

const [kojaRepo, tikkRepo] = fakeRepos;

const spaceEnd = (space: FakeSpace): Element[] => {
  const end: Element[] = [];

  if (space.pull !== undefined) {
    end.push(roleText('detail', `#${space.pull}`).flex_none());
  }

  if (space.badge !== undefined) {
    end.push(attentionBadge(space.badge));
  }

  return end;
};

const spaceRow = (space: FakeSpace): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: space.state,
    label: space.label,
    cut: 'middle',
    start: spaceMark(space.status),
    end: spaceEnd(space),
  });

const repoRow = (repo: FakeRepo): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    label: repoLabel({
      name: repo.name,
      branch: repo.branch,
      age: repo.age,
      folded: false,
      selected: false,
    }),
    end: [statusMark(repo.status)],
  });

const repoGroup = (repo: FakeRepo): Element =>
  v_flex()
    .flex_none()
    .children([repoRow(repo), ...repo.spaces.map(spaceRow)]);

const sidebar = (): Element => {
  const repos = [kojaRepo, tikkRepo].filter((repo): repo is FakeRepo => repo !== undefined);

  return v_flex()
    .w(shellSize.sidebarWidth)
    .flex_none()
    .h_full()
    .py(spacing.medium)
    .gap(spacing.medium)
    .children(repos.map(repoGroup));
};

const tabElement = (fakeTab: FakeTab): Element => {
  const palette = colors();
  const bright = fakeTab.active;
  const iconColor = bright ? palette.foreground : palette.dim;

  return tab({
    label: fakeTab.label,
    active: fakeTab.active,
    icon: programIcon(fakeTab.program, 'small').text_color(iconColor),
    status: fakeTab.status,
    close: iconButton({ name: 'x', size: 'small' }),
  });
};

const tabBar = (): Element =>
  h_flex()
    .h(controlSize.tabBar)
    .flex_none()
    .px(spacing.xsmall)
    .gap(spacing.xxsmall)
    .items_center()
    .children(fakeTabs.map(tabElement))
    .child(h_flex().flex_1())
    .child(iconButton({ name: 'plus' }))
    .child(modePill({ label: 'Normal' }))
    .child(iconToggle({ name: 'git-compare', label: 'Changes', active: true }))
    .child(iconToggle({ name: 'folder', label: 'Files', active: false }));

const terminalBody = (lines: string[]): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(spacing.medium)
    .gap(spacing.xxsmall)
    .font_family('JetBrains Mono')
    .children(lines.map((line) => roleText('detail', line, 'foreground')));

const paneCard = (header: PaneHeaderOptions, lines: string[], grow: number): Element => {
  const palette = colors();

  return v_flex()
    .flex_grow(grow)
    .flex_shrink(1)
    .flex_basis(0)
    .min_w(0)
    .h_full()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(header.focused ? palette.accent : palette.selected)
    .bg(palette.background)
    .overflow_hidden()
    .child(paneHeader(header))
    .child(terminalBody(lines));
};

const changeRow = (change: FakeChange): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    cut: 'middle',
    start: fileStatusMark(change.status),
    label: change.path,
    end: [
      roleText('detail', `+${change.add}`, 'ansi2').flex_none(),
      roleText('detail', `−${change.del}`, 'ansi1').flex_none(),
    ],
  });

const sidePanel = (): Element => {
  const palette = colors();

  const titleRow = h_flex()
    .h(diffSize.headerHeight)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .child(roleText('title', 'Changes').flex_none())
    .child(roleText('detail', '3 files').flex_none())
    .child(h_flex().flex_1())
    .child(roleText('detail', '+38', 'ansi2').flex_none())
    .child(roleText('detail', '−6', 'ansi1').flex_none());

  return v_flex()
    .w(shellSize.panelWidth)
    .flex_none()
    .h_full()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(palette.selected)
    .bg(palette.background)
    .overflow_hidden()
    .child(titleRow)
    .child(
      v_flex()
        .flex_none()
        .p(spacing.xsmall)
        .gap(spacing.xxsmall)
        .children(changeRows.map(changeRow)),
    );
};

const main = (): Element =>
  v_flex()
    .flex_1()
    .h_full()
    .min_w(0)
    .min_h(0)
    .child(tabBar())
    .child(
      h_flex()
        .flex_1()
        .min_h(0)
        .gap(spacing.small)
        .p(spacing.small)
        .child(
          paneCard(
            {
              ...agentPane,
              focused: true,
              zoomed: false,
              width: shellSize.focusedPaneWidth,
            },
            agentPane.lines,
            shellSize.focusedPaneShare,
          ),
        )
        .child(
          paneCard(
            {
              ...shellPane,
              focused: false,
              zoomed: false,
              width: shellSize.shellPaneWidth,
            },
            shellPane.lines,
            shellSize.shellPaneShare,
          ),
        )
        .child(sidePanel()),
    );

export const shellScene = (): Element =>
  h_flex().flex_1().min_h(0).bg(colors().chrome).child(sidebar()).child(main());
