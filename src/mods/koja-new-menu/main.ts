// The + menu of the tab bar: a terminal, an agent from Herdr's program table, a space, or a
// worktree. Digits 1 to 9 start the installed agent with that number.

import type { AsyncContext, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { v_flex } from 'gpui-base';
import type { Program } from 'herdr';
import { closeOverlay, knownAgents, panes, props, run, spaces } from 'herdr';

import {
  colors,
  controlSize,
  detailText,
  emptyState,
  icon,
  keyHint,
  listRow,
  openWorktreeDialog,
  overlaySize,
  programIcon,
  recordOf,
  rowHeight,
  sectionHeader,
  separator,
  separatorHeight,
  shortcutFor,
  spacing,
  stringOf,
  textSize,
} from '../../kit/index.ts';

type Agent = Program & { run: string[]; installed: boolean };

interface MenuEntry {
  id: string;
  start: Element;
  label: string;
  hint: Element | null;
  enabled: boolean;
  action: () => void;
}

// Not-installed agents shown after the installed ones, so people can find them.
const suggestedAgents = 2;

// Rows other than agents: Terminal, New space, and the two worktree rows.
const fixedRows = 4;

const digitKeys = 9;

const activeSpace = (): ReturnType<typeof spaces>[number] | undefined =>
  spaces().find((space) => space.active);

const focusedFolder = (): string | null => panes().find((pane) => pane.focused)?.cwd ?? null;

const closeMenu = (): void => {
  const overlay = stringOf(recordOf(props())['overlay']);

  if (overlay !== null) {
    closeOverlay(overlay);
  }
};

const startAgent = (agent: Agent): void => {
  run('tab.new', { name: agent.name, space: activeSpace()?.id, argv: agent.run });
};

const shortcutHint = (action: string): Element | null => {
  const keys = shortcutFor(action);

  return keys === null ? null : keyHint(keys);
};

const agentHint = (agent: Agent, index: number): Element | null => {
  if (!agent.installed) {
    return detailText('not installed');
  }

  return index < digitKeys ? detailText(String(index + 1)) : null;
};

// Without a separate scroll range, the agent list takes what the other rows leave.
const menuHeight = (agentRows: number): number => {
  const chrome = controlSize.sectionHeader + separatorHeight + spacing.xsmall * 2;
  const content = (fixedRows + Math.max(1, agentRows)) * rowHeight.medium + chrome;

  return Math.min(overlaySize.wideMenuContentHeight, content);
};

export default class NewMenu extends View {
  private agents: Agent[] = [];

  private failed = false;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();
    this.handle.focus();

    cx.spawn(async (taskCx) => {
      try {
        this.agents = await knownAgents({ on: activeSpace()?.machine ?? null });
      } catch {
        this.failed = true;
      }

      taskCx.notify();
    });
  }

  override render(): Element {
    const installed = this.agents.filter((agent) => agent.installed);
    const missing = this.agents.filter((agent) => !agent.installed).slice(0, suggestedAgents);
    const choices = [...installed, ...missing];

    const menu = v_flex()
      .id('new-menu')
      .min_h(0)
      .w_full()
      .h(menuHeight(choices.length))
      .py(spacing.xsmall)
      .bg(colors().popover)
      .text_size(textSize.default)
      .on_key_down((event) => {
        this.onKey(event, installed);
      })
      .child(this.row(this.terminalEntry()))
      .child(sectionHeader({ label: 'Start an agent', size: 'default' }))
      .child(this.agentList(choices))
      .child(separator())
      .children(this.placeEntries().map((entry) => this.row(entry)));

    return this.handle === null ? menu : menu.track_focus(this.handle);
  }

  private onKey(event: KeyEvent, installed: Agent[]): void {
    const { control, platform, alt } = event.modifiers;

    if (control || platform || alt) {
      return;
    }

    const agent = /^[1-9]$/.test(event.key) ? installed[Number(event.key) - 1] : undefined;

    if (agent !== undefined) {
      closeMenu();
      startAgent(agent);
    }
  }

  private terminalEntry(): MenuEntry {
    return {
      id: 'terminal',
      start: icon('terminal'),
      label: 'Terminal',
      hint: shortcutHint('tab.new'),
      enabled: true,
      action: () => {
        run('tab.new', { space: activeSpace()?.id });
      },
    };
  }

  private placeEntries(): MenuEntry[] {
    const space = activeSpace()?.id ?? null;

    return [
      {
        id: 'space',
        start: icon('plus'),
        label: 'New space',
        hint: shortcutHint('space.new'),
        enabled: true,
        action: () => {
          run('space.new');
        },
      },
      {
        id: 'worktree',
        start: icon('git-branch'),
        label: 'New worktree…',
        hint: null,
        enabled: space !== null,
        action: () => {
          openWorktreeDialog('new', space, focusedFolder());
        },
      },
      {
        id: 'worktree-open',
        start: icon('git-branch'),
        label: 'Open worktree…',
        hint: null,
        enabled: space !== null,
        action: () => {
          openWorktreeDialog('open', space, focusedFolder());
        },
      },
    ];
  }

  private agentList(choices: Agent[]): Element {
    const list = v_flex().flex_1().min_h(0).overflow_y_scrollbar();

    if (this.agents.length === 0) {
      return list.child(
        emptyState(this.failed ? 'Could not load agents' : 'Checking installed agents…'),
      );
    }

    return list.children(
      choices.map((agent, index) =>
        this.row({
          id: agent.key,
          start: programIcon(agent, 'default'),
          label: agent.name,
          hint: agentHint(agent, index),
          enabled: agent.installed,
          action: () => {
            startAgent(agent);
          },
        }),
      ),
    );
  }

  private row(entry: MenuEntry): Element {
    return listRow({
      size: 'medium',
      inset: true,
      state: entry.enabled ? 'normal' : 'disabled',
      start: entry.start,
      label: entry.label,
      end: entry.hint === null ? [] : [entry.hint],
    })
      .id(entry.id)
      .on_click(() => {
        if (entry.enabled) {
          closeMenu();
          entry.action();
        }
      });
  }
}
