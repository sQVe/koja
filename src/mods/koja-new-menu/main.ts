import { v_flex } from 'gpui-base';
import type { AsyncContext, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { knownAgents, panes, run, spaces } from 'herdr';

import {
  closeOverlay,
  controlSize,
  detailText,
  emptyState,
  icon,
  keyHint,
  listRow,
  openWorktreeDialog,
  overlaySize,
  popupSurface,
  programIcon,
  rowHeight,
  sectionHeader,
  separator,
  separatorHeight,
  shortcutFor,
  spacing,
  textSize,
} from '../../kit/index.ts';
import type { Agent, AgentLoad, MenuTarget } from './agents.ts';
import { agentList, menuActions, menuTarget, placeholderFor } from './agents.ts';

interface MenuEntry {
  id: string;
  start: Element;
  label: string;
  hint: Element | null;
  enabled: boolean;
  action: () => void;
}

const suggestedAgents = 2;

const fixedRows = 4;

const digitKeys = 9;

const activeSpace = (): ReturnType<typeof spaces>[number] | undefined =>
  spaces().find((space) => space.active);

const focusedFolder = (): string | null => panes().find((pane) => pane.focused)?.cwd ?? null;

const closeMenu = (): void => {
  closeOverlay();
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

const menuHeight = (agentRows: number): number => {
  const chrome = controlSize.sectionHeader + separatorHeight + spacing.xsmall * 2;
  const content = (fixedRows + Math.max(1, agentRows)) * rowHeight.medium + chrome;

  return Math.min(overlaySize.wideMenuContentHeight, content);
};

export default class NewMenu extends View {
  private load: AgentLoad = { status: 'pending' };

  private target: MenuTarget = { space: null, machine: null, folder: null };

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();
    this.handle.focus();

    this.target = menuTarget(activeSpace(), focusedFolder());

    cx.spawn(async (taskCx) => {
      try {
        const agents = await knownAgents({ on: this.target.machine });

        this.load = { status: 'loaded', agents };
      } catch {
        this.load = { status: 'failed' };
      }

      taskCx.notify();
    });
  }

  private startAgent(agent: Agent): void {
    run('tab.new', menuActions(this.target).agent(agent));
  }

  override render(): Element {
    const agents = agentList(this.load);
    const installed = agents.filter((agent) => agent.installed);
    const missing = agents.filter((agent) => !agent.installed).slice(0, suggestedAgents);
    const choices = [...installed, ...missing];

    const menu = popupSurface('new-menu')
      .h(menuHeight(choices.length))
      .py(spacing.xsmall)
      .text_size(textSize.default)
      .on_key_down((event) => {
        this.onKey(event, installed);
      })
      .child(this.row(this.terminalEntry()))
      .child(sectionHeader({ label: 'Start an agent', size: 'default' }))
      .child(this.agentRows(choices))
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
      this.startAgent(agent);
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
        run('tab.new', menuActions(this.target).terminal);
      },
    };
  }

  private placeEntries(): MenuEntry[] {
    const { space: newSpace, worktree } = menuActions(this.target);

    return [
      {
        id: 'space',
        start: icon('plus'),
        label: 'New space',
        hint: shortcutHint('space.new'),
        enabled: true,
        action: () => {
          run('space.new', newSpace);
        },
      },
      {
        id: 'worktree',
        start: icon('git-branch'),
        label: 'New worktree…',
        hint: null,
        enabled: worktree.space !== null,
        action: () => {
          openWorktreeDialog('new', worktree.space, worktree.folder);
        },
      },
      {
        id: 'worktree-open',
        start: icon('git-branch'),
        label: 'Open worktree…',
        hint: null,
        enabled: worktree.space !== null,
        action: () => {
          openWorktreeDialog('open', worktree.space, worktree.folder);
        },
      },
    ];
  }

  private agentRows(choices: Agent[]): Element {
    const list = v_flex().flex_1().min_h(0).overflow_y_scrollbar();
    const placeholder = placeholderFor(this.load);

    if (placeholder !== null) {
      return list.child(emptyState(placeholder));
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
            this.startAgent(agent);
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
