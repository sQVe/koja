import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon } from '../../../../kit/index.ts';
import { agentPane } from '../../scenes/shellContent.ts';
import { mainWidth } from '../overlays/parts.ts';
import { changeList, changeTotals } from '../panels/changes.ts';
import {
  card,
  cardSlot,
  fixedLabel,
  iconButton,
  iconToggle,
  label,
  middleCutLabel,
  modePill,
  paneHeaderFrame,
  statusMark,
  styled,
  terminalFont,
  uiFont,
} from '../parts.ts';
import type { FakeProject } from '../sidebars/content.ts';
import { fakeProjects } from '../sidebars/content.ts';
import { questionMark } from '../sidebars/facts.ts';
import { mapSidebarOf } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { branchField } from '../window.ts';

type AttentionVariant = 'corner' | 'brief' | 'mix';
type AttentionStatus = Status | 'crashed' | null;

interface AttentionTab {
  label: string;
  status: AttentionStatus;
  active: boolean;
}

interface AttentionWindow {
  variant: AttentionVariant;
}

export const hiddenAsks = [
  {
    space: 'Build window shell',
    project: 'koja',
    question: 'Run bun run sandbox up?',
    description: 'Claude Code asks to run bun run sandbox up.',
    agent: 'Claude Code',
    tab: 'Build shell',
    age: '2m',
  },
  {
    space: 'Hill-climb mode for judges',
    project: 'tau',
    question: 'Which judge model for round 2?',
    description: 'Pi asks which judge model to use for round 2.',
    agent: 'Pi',
    tab: 'Pick judges',
    age: '5m',
  },
] as const;

const tabContentGap = 6;
const controlGap = 4;
const referenceChangesWidth = 356;
const narrowChangesWidth = 224;
const askingPaneWidth = 300;

// The focused agent pane takes the width the asking pane and Changes leave in the main column.
export const focusedPaneWidth = (tokens: DirectionTokens): number =>
  mainWidth -
  2 * tokens.areas.contentPadding -
  2 * tokens.areas.contentGap -
  askingPaneWidth -
  narrowChangesWidth;

const attentionProjects: FakeProject[] = fakeProjects.map((project) => ({
  name: project.name,
  spaces: project.spaces.map((space) => {
    const asking = space.selected || hiddenAsks.some((ask) => ask.space === space.title);
    const agent = asking ? 'blocked' : space.agent;

    return Object.assign({}, space, { agent });
  }),
}));

const attentionTabs: AttentionTab[] = [
  { label: 'Design the sidebar', status: 'blocked', active: true },
  { label: 'Judge round', status: 'done', active: false },
  { label: 'Mock scenes', status: 'crashed', active: false },
  { label: 'zsh', status: null, active: false },
];

const attentionMark = (status: AttentionStatus, tokens: DirectionTokens): Element => {
  if (status === 'blocked') {
    return questionMark(tokens);
  }

  if (status === 'crashed') {
    return icon('circle-alert', 'small').text_color(tokens.marks.blocked);
  }

  return statusMark(status, tokens);
};

const attentionTab = (
  tab: AttentionTab,
  variant: AttentionVariant,
  tokens: DirectionTokens,
): Element => {
  const { tabs } = tokens;
  const color = tab.active ? tabs.activeText : tabs.text;
  const leadingMark = variant === 'mix' && tab.status !== null;

  const leading = leadingMark
    ? attentionMark(tab.status, tokens)
    : icon('terminal', 'small').text_color(color);

  const element = h_flex()
    .h(tabs.height)
    .px(tabs.paddingX)
    .gap(tabContentGap)
    .flex_none()
    .items_center()
    .rounded(tabs.radius)
    .child(leading)
    .child(fixedLabel(tab.label, tokens.text.body, color));

  if (tab.active) {
    element.bg(tabs.activeFill).border(1).border_color(tabs.activeBorder);
  }

  if (!leadingMark) {
    element.child(attentionMark(tab.status, tokens));
  }

  return tab.active ? element.child(iconButton('x', tokens, tokens.ink.dim)) : element;
};

const attentionBar = (options: AttentionWindow, tokens: DirectionTokens): Element => {
  const controls = h_flex().flex_1().gap(controlGap).items_center().justify_end();

  controls
    .child(iconButton('plus', tokens, tokens.controls.primary))
    .child(modePill(tokens))
    .child(iconToggle('git-compare', true, tokens))
    .child(iconToggle('folder', false, tokens));

  return h_flex()
    .h(tokens.tabs.barHeight)
    .flex_none()
    .px(tokens.tabs.barPadding)
    .gap(tokens.tabs.gap)
    .items_center()
    .children(attentionTabs.map((tab) => attentionTab(tab, options.variant, tokens)))
    .child(controls);
};

const paneName = (asking: boolean, tokens: DirectionTokens): Element => {
  if (asking) {
    return fixedLabel('Pi', tokens.text.body, tokens.ink.muted);
  }

  const color = tokens.pane.focusedHeaderInk ?? tokens.ink.text;

  return fixedLabel('Claude Code', tokens.text.title, color);
};

const paneIcon = (asking: boolean, tokens: DirectionTokens): Element => {
  const color = asking ? tokens.ink.dim : (tokens.pane.focusedHeaderInk ?? tokens.ink.muted);

  return icon('terminal', 'default').text_color(color);
};

// The task names the work, so the branch gives up its width before the task does.
const taskFirstFields = (asking: boolean, tokens: DirectionTokens): Element[] => {
  const { ink, text } = tokens;
  const task = asking ? 'Review findings' : 'Design the sidebar';
  const branch = asking ? 'main' : (agentPane.branch ?? '');

  const branchPart = h_flex()
    .ml_auto()
    .min_w(0)
    .gap(controlGap)
    .items_center()
    .text_color(ink.dim)
    .child(icon('git-branch', 'small').flex_none())
    .child(middleCutLabel(branch, text.detail, ink.dim));

  return [
    fixedLabel(task, text.detail, ink.muted),
    branchPart,
    fixedLabel(agentPane.folder, text.detail, ink.dim),
  ];
};

const paneHeader = (
  asking: boolean,
  variant: AttentionVariant,
  tokens: DirectionTokens,
): Element => {
  const status = asking ? 'blocked' : 'working';
  const leadingMark = variant === 'mix';
  const header = paneHeaderFrame(tokens);
  const { ink, text, pane } = tokens;
  const task = asking ? 'Review findings' : 'Design the sidebar';

  const leading = leadingMark ? attentionMark(status, tokens) : paneIcon(asking, tokens);

  if (!asking && pane.focusedHeaderFill !== null) {
    header.bg(pane.focusedHeaderFill);
  }

  header.child(leading).child(paneName(asking, tokens));

  if (variant === 'mix') {
    header.children(taskFirstFields(asking, tokens));
  } else {
    header.child(label(task, text.detail, ink.muted).flex_1());
  }

  if (variant !== 'corner' && variant !== 'mix') {
    const branch = asking ? 'main' : agentPane.branch;

    if (branch !== undefined) {
      header.child(branchField(branch, tokens));
    }

    header.child(fixedLabel(agentPane.folder, text.detail, ink.dim));
  }

  if (!leadingMark) {
    header.child(attentionMark(status, tokens));
  }

  return header.child(iconButton('ellipsis', tokens, ink.dim));
};

const terminalPane = (
  asking: boolean,
  variant: AttentionVariant,
  tokens: DirectionTokens,
): Element => {
  const lines = asking
    ? [
        'Review findings',
        '',
        'The two sizes are ready.',
        'The 12 px bar keeps the row quiet.',
        '',
        '? Keep the 12 px bar',
        '  or try 16 px?',
      ]
    : agentPane.lines;

  const body = v_flex()
    .flex_1()
    .min_h(0)
    .p(tokens.pane.bodyPadding)
    .gap(2)
    .font_family(terminalFont)
    .text_size(tokens.text.terminal)
    .text_color(tokens.ink.text)
    .children(lines.map((line) => div().child(line)));

  const inner = card(!asking, tokens)
    .child(paneHeader(asking, variant, tokens))
    .child(body);

  const slot = cardSlot(inner, tokens);
  const fixedWidth = asking && variant !== 'corner';

  return fixedWidth ? slot.w(askingPaneWidth).flex_none() : slot.flex_1();
};

const changesPaneWidth = (variant: AttentionVariant): number => {
  if (variant === 'corner') {
    return referenceChangesWidth;
  }

  return narrowChangesWidth;
};

const changesPane = (variant: AttentionVariant, tokens: DirectionTokens): Element => {
  const header = paneHeaderFrame(tokens)
    .child(fixedLabel('Changes', tokens.text.title, tokens.ink.text))
    .child(fixedLabel('3 files', tokens.text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .children(changeTotals(tokens));

  const inner = card(false, tokens).child(header).child(changeList(tokens));

  return cardSlot(inner, tokens).w(changesPaneWidth(variant)).flex_none();
};

export const attentionWindow = (options: AttentionWindow, tokens: DirectionTokens): Element => {
  const sidebar = mapSidebarOf(attentionProjects, tokens);

  const panes = h_flex()
    .flex_1()
    .min_h(0)
    .p(tokens.areas.contentPadding)
    .gap(tokens.areas.contentGap)
    .child(terminalPane(false, options.variant, tokens))
    .child(terminalPane(true, options.variant, tokens))
    .child(changesPane(options.variant, tokens));

  const main = v_flex()
    .flex_1()
    .h_full()
    .min_w(0)
    .min_h(0)
    .child(attentionBar(options, tokens))
    .child(panes);

  return styled(
    h_flex().flex_1().min_h(0).bg(tokens.areas.frame).font_family(uiFont),
    tokens.text.body,
    tokens.ink.text,
  )
    .child(sidebar)
    .child(main);
};
