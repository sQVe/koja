import { h_flex, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { checking, knownAgents, panes, run, setShared, shared, spaces } from 'herdr';

import { placeOf } from '../../data/gitIdentity.ts';
import type { IconName, OverlayHint, RowState } from '../../kit/index.ts';
import {
  closeOverlay,
  colors,
  icon,
  listRow,
  overlaySize,
  inNormalMode,
  newMenuOpenKey,
  openWorktreeDialog,
  overlayCard,
  overlayHints,
  radius,
  roleText,
  rowHeight,
  shortcutFor,
  spacing,
  stateLine,
  toggleButton,
} from '../../kit/index.ts';
import type { Agent, AgentLoad, AgentState, MenuTarget } from './agents.ts';
import {
  agentState,
  cachedAgents,
  installedAgents,
  knownAgentsKey,
  menuActions,
  menuTarget,
  rememberAgents,
} from './agents.ts';
import { repositoryNameAt } from './repository.ts';

interface MenuRow {
  id: string;
  start: Element;
  label: string;
  end: Element[];
  enabled: boolean;
  action: () => void;
}

type RowOptions = Omit<Parameters<typeof listRow>[0], 'inset'>;

const activeSpace = (): ReturnType<typeof spaces>[number] | undefined =>
  spaces().find((space) => space.active);

const focusedFolder = (): string | null => panes().find((pane) => pane.focused)?.cwd ?? null;

const mark = (name: IconName): Element => icon(name, 'small').text_color(colors().muted);

// An overlay row fills the card's content width, so its pill runs to the card's padding. The row's
// hairline outline sits inside that padding, so the padding drops one pixel to keep the row's
// content on the card's padding edge, as the card's other children are.
const menuRow = (options: RowOptions): Element =>
  listRow({ ...options, inset: false })
    .px(spacing.medium - spacing.hairline)
    .rounded(radius.default);

const heading = (text: string): Element =>
  h_flex()
    .h(rowHeight.small)
    .flex_none()
    .min_w(0)
    .px(spacing.medium)
    .items_center()
    .child(roleText('sectionHeading', text));

const divider = (): Element => div().flex_none().h(spacing.hairline).bg(colors().border);

// The two headings, the Terminal row, and the three space rows: everything but the agent rows.
const fixedRows = 6;

// The card's own padding, the divider, and the gap between each pair of its children.
const fixedChrome = spacing.hairline + spacing.small * 2;

const childGaps = 7;

const fixedHeight = fixedRows * rowHeight.small + fixedChrome + childGaps * spacing.xxsmall;

// A long agent list scrolls, so the space actions stay in reach inside the popup the tab bar opens.
const agentListHeight = overlaySize.wideMenuHeight - fixedHeight;

// A scroll box takes its height from its caller, so the list is as tall as its rows until the
// popup runs out of room.
const agentListRowHeight = (rows: number): number =>
  Math.min(rows * rowHeight.small + Math.max(0, rows - 1) * spacing.xxsmall, agentListHeight);

const hintKeys = (action: string): string[] => {
  const keys = shortcutFor(action);

  return keys === null ? [] : keys.split(' ');
};

export default class NewMenu extends View {
  private load: AgentLoad = { status: 'pending' };

  private target: MenuTarget = { space: null, machine: null, folder: null };

  private repository: string | null = null;

  private reading = false;

  private normalMode = false;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.normalMode = inNormalMode(shared);
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.target = menuTarget(activeSpace(), focusedFolder());
    this.repository = this.readRepository();
    setShared(newMenuOpenKey, true);

    const cached = cachedAgents(shared(knownAgentsKey), this.target.machine);

    if (cached.length > 0) {
      this.load = { status: 'loaded', agents: cached };
    }

    if (checking()) {
      return;
    }

    this.lookAgents(cx);
  }

  override close(): void {
    setShared(newMenuOpenKey, false);
  }

  override render(): Element {
    const placeRows = this.placeRows().map((row) => this.row(row));

    const card = overlayCard('new-menu')
      .flex_none()
      .on_mouse_down('left', (_event, cx) => {
        cx.stop_propagation();
      })
      .child(heading('New tab'))
      .child(this.row(this.terminalRow(), 'selected'))
      .child(this.agentRows())
      .child(divider())
      .child(heading('New space'))
      .children(placeRows);

    // The popup is taller than the card, so a press under it closes the menu as one beside it does.
    const backdrop = div()
      .id('new-menu-backdrop')
      .size_full()
      .on_mouse_down('left', () => {
        closeOverlay();
      })
      .child(card);

    return this.handle === null ? backdrop : backdrop.track_focus(this.handle);
  }

  private readRepository(): string | null {
    if (this.target.folder === null) {
      return null;
    }

    const place = placeOf(this.target.machine, this.target.folder);

    return repositoryNameAt(shared, place);
  }

  // A read already under way keeps the error line until it answers, and Retry reads at once.
  private lookAgents(cx: Context): void {
    if (this.reading) {
      return;
    }

    this.reading = true;

    cx.spawn(async (taskCx) => {
      try {
        const agents = await knownAgents({ on: this.target.machine });

        this.load = { status: 'loaded', agents };

        setShared(
          knownAgentsKey,
          rememberAgents(shared(knownAgentsKey), this.target.machine, agents),
        );
      } catch {
        this.load = { status: 'failed', agents: installedAgents(this.load) };
      } finally {
        this.reading = false;
        taskCx.notify();
      }
    });
  }

  private hint(action: string): Element[] {
    const hint: OverlayHint = { normal: hintKeys(action) };

    return overlayHints(hint, this.normalMode);
  }

  private startAgent(agent: Agent): void {
    const launch = menuActions(this.target).agent(agent);

    run('tab.new', launch);
  }

  private terminalRow(): MenuRow {
    return {
      id: 'terminal',
      start: mark('terminal'),
      label: 'Terminal',
      end: this.hint('tab.new'),
      enabled: true,
      action: () => {
        run('tab.new', menuActions(this.target).terminal);
      },
    };
  }

  private agentRow(agent: Agent): MenuRow {
    return {
      id: agent.key,
      start: mark('terminal'),
      label: agent.name,
      end: [],
      enabled: true,
      action: () => {
        this.startAgent(agent);
      },
    };
  }

  private agentRows(): Element {
    const state = agentState(this.load);
    const agents = installedAgents(this.load).map((agent) => this.row(this.agentRow(agent)));
    const rows = state === null ? agents : [...agents, this.stateRow(state)];

    return v_flex()
      .flex_none()
      .min_h(0)
      .h(agentListRowHeight(rows.length))
      .gap(spacing.xxsmall)
      .overflow_y_scrollbar()
      .children(rows);
  }

  private stateRow(state: AgentState): Element {
    if (state.kind !== 'error') {
      return stateLine({ kind: state.kind, text: state.text });
    }

    const retry = toggleButton({ label: 'Retry', active: false }).on_click((_event, cx) => {
      cx.stop_propagation();
      this.lookAgents(cx);
    });

    return stateLine({ kind: 'error', text: state.text, action: retry });
  }

  private worktreeLabel(kind: 'new' | 'existing'): string {
    const start = kind === 'new' ? 'From a new worktree' : 'From an existing worktree';

    return this.repository === null ? `${start}…` : `${start} of ${this.repository}…`;
  }

  private placeRows(): MenuRow[] {
    const { space: newSpace, worktree } = menuActions(this.target);
    const enabled = worktree.space !== null;

    return [
      {
        id: 'space',
        start: mark('plus'),
        label: 'Empty space',
        end: this.hint('space.new'),
        enabled: true,
        action: () => {
          run('space.new', newSpace);
        },
      },
      {
        id: 'worktree',
        start: mark('git-branch'),
        label: this.worktreeLabel('new'),
        end: [],
        enabled,
        action: () => {
          openWorktreeDialog('new', worktree.space, worktree.folder);
        },
      },
      {
        id: 'worktree-open',
        start: mark('git-branch'),
        label: this.worktreeLabel('existing'),
        end: [],
        enabled,
        action: () => {
          openWorktreeDialog('open', worktree.space, worktree.folder);
        },
      },
    ];
  }

  private row(entry: MenuRow, state: RowState = 'normal'): Element {
    const shown = entry.enabled ? state : 'disabled';

    return menuRow({
      size: 'small',
      state: shown,
      start: entry.start,
      label: entry.label,
      end: entry.end,
    })
      .id(entry.id)
      .on_click(() => {
        if (entry.enabled) {
          closeOverlay();
          entry.action();
        }
      });
  }
}
